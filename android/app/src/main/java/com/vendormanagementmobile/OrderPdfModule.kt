package com.vendormanagementmobile

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class OrderPdfModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "OrderPdfModule"

  @ReactMethod
  fun generateOrderBill(payload: ReadableMap, promise: Promise) {
    Thread {
      try {
        val billPayload = payload.toBillPayload()
        val pdfBytes = buildPdfBytes(billPayload)
        val fileName = "bill_${sanitizeFileName(billPayload.orderNumber)}.pdf"
        val fileUri = savePdf(fileName, pdfBytes)
        val opened = openPdf(fileUri)

        val result = Arguments.createMap().apply {
          putString("fileName", fileName)
          putString("fileUri", fileUri.toString())
          putBoolean("opened", opened)
        }

        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("PDF_GENERATION_ERROR", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun openPdfFromUrl(payload: ReadableMap, promise: Promise) {
    Thread {
      try {
        val remotePdfRequest = payload.toRemotePdfRequest()
        val file = downloadPdfToCache(remotePdfRequest)
        val fileUri = getFileContentUri(file)
        val opened = openPdf(fileUri)

        val result = Arguments.createMap().apply {
          putString("fileName", file.name)
          putString("fileUri", fileUri.toString())
          putBoolean("opened", opened)
        }

        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("PDF_OPEN_ERROR", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun printPdfFromUrl(payload: ReadableMap, promise: Promise) {
    Thread {
      try {
        val remotePdfRequest = payload.toRemotePdfRequest()
        val file = downloadPdfToCache(remotePdfRequest)
        val fileUri = getFileContentUri(file)

        UiThreadUtil.runOnUiThread {
          try {
            val activity =
                currentActivity
                    ?: throw IOException("Printing requires the app to stay open on screen.")
            val printManager =
                activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                    ?: throw IOException("Android print service is not available.")
            val jobName =
                remotePdfRequest.jobName.ifBlank {
                  "Receipt ${file.nameWithoutExtension.ifBlank { "print" }}"
                }

            printManager.print(
                jobName,
                PdfFilePrintAdapter(file, jobName),
                PrintAttributes.Builder().build(),
            )

            val result = Arguments.createMap().apply {
              putString("fileName", file.name)
              putString("fileUri", fileUri.toString())
              putBoolean("queued", true)
            }

            promise.resolve(result)
          } catch (error: Exception) {
            promise.reject("PDF_PRINT_ERROR", error.message, error)
          }
        }
      } catch (error: Exception) {
        promise.reject("PDF_PRINT_ERROR", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun renderPdfForGrayscalePrinter(payload: ReadableMap, promise: Promise) {
    Thread {
      try {
        val remotePdfRequest = payload.toRemotePdfRequest()
        val file = downloadPdfToCache(remotePdfRequest)
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)

        val targetWidth = 320 // 40 bytes - Safe width for all 58mm printers to avoid cropping
        val internalPadding = 0
        val totalLines = mutableListOf<ByteArray>()
        
        // For preview
        var previewBitmap: Bitmap? = null
        var previewCanvas: Canvas? = null
        var previewY = 0f

        for (i in 0 until renderer.pageCount) {
          val page = renderer.openPage(i)
          val aspectRatio = page.height.toFloat() / page.width.toFloat()
          val targetHeight = (targetWidth * aspectRatio).toInt()

          val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bitmap)
          canvas.drawColor(Color.WHITE)
          
          // Use full width destRect to match lxprint
          val destRect = Rect(0, 0, targetWidth, targetHeight)
          page.render(bitmap, destRect, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
          
          // Add to preview
          if (previewBitmap == null) {
              // Create a tall bitmap for all pages
              previewBitmap = Bitmap.createBitmap(targetWidth, targetHeight * renderer.pageCount, Bitmap.Config.ARGB_8888)
              previewCanvas = Canvas(previewBitmap!!)
              previewCanvas.drawColor(Color.WHITE)
          }
          previewCanvas?.drawBitmap(bitmap, 0f, previewY, null)
          previewY += targetHeight

          // Convert bitmap to 1bpp (96 bytes per line)
          for (y in 0 until targetHeight) {
            val lineBytes = ByteArray(96)
            for (x in 0 until targetWidth) {
              val pixel = bitmap.getPixel(x, y)
              val gray = (Color.red(pixel) + Color.green(pixel) + Color.blue(pixel)) / 3
              if (gray < 200) {
                val byteIdx = x / 8
                val bitIdx = 7 - (x % 8)
                lineBytes[byteIdx] = (lineBytes[byteIdx].toInt() or (1 shl bitIdx)).toByte()
              }
            }
            totalLines.add(lineBytes)
          }
          bitmap.recycle()
          page.close()
        }

        renderer.close()
        pfd.close()

        // White-space trimming: Find the last line that has at least one black pixel
        var lastContentLine = totalLines.size
        for (i in totalLines.size - 1 downTo 0) {
            val line = totalLines[i]
            var hasContent = false
            for (b in line) {
                if (b.toInt() != 0) {
                    hasContent = true
                    break
                }
            }
            if (hasContent) {
                lastContentLine = i + 1
                break
            }
        }
        
        // Add a small 10px buffer at the bottom
        val finalLineCount = Math.min(totalLines.size, lastContentLine + 10)
        val trimmedLines = totalLines.subList(0, finalLineCount)

        val flatBytes = ByteArray(trimmedLines.size * 96)
        var offset = 0
        for (line in trimmedLines) {
          System.arraycopy(line, 0, flatBytes, offset, 96)
          offset += 96
        }
        
        // Generate PNG preview base64
        val previewBase64 = previewBitmap?.let {
            // Trim the preview bitmap too
            val trimmedPreview = if (finalLineCount < it.height) {
                Bitmap.createBitmap(it, 0, 0, it.width, finalLineCount)
            } else {
                it
            }
            val stream = ByteArrayOutputStream()
            trimmedPreview.compress(Bitmap.CompressFormat.PNG, 100, stream)
            val bytes = stream.toByteArray()
            if (trimmedPreview != it) trimmedPreview.recycle()
            it.recycle()
            android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        } ?: ""

        val result = Arguments.createMap().apply {
          putString("base64Data", android.util.Base64.encodeToString(flatBytes, android.util.Base64.NO_WRAP))
          putString("previewBase64", previewBase64)
          putInt("widthBytes", 96)
          putInt("totalLines", trimmedLines.size)
        }

        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("PDF_RENDER_ERROR", error.message, error)
      }
    }.start()
  }

  private fun buildPdfBytes(payload: BillPayload): ByteArray {
    val document = PdfDocument()
    val bodyPaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.parseColor("#1C2E52")
          textSize = 12f
        }
    val bodyPaintBold =
        Paint(bodyPaint).apply {
          typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
    val headingPaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.parseColor("#4B39F4")
          textSize = 11f
          typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
    val subtlePaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.parseColor("#7487AD")
          textSize = 11f
        }
    val titlePaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.parseColor("#12214A")
          textSize = 22f
          typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
    val linePaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.parseColor("#D9E2F2")
          strokeWidth = 1f
        }

    val currencyFormatter = NumberFormat.getCurrencyInstance(Locale.US)
    val pageWidth = 595
    val pageHeight = 842
    val margin = 40f
    val contentWidth = pageWidth - margin * 2
    val rowHeight = 22f
    val itemColumnX = margin
    val qtyColumnX = margin + 295f
    val priceColumnX = margin + 365f
    val totalColumnX = margin + 455f

    var pageNumber = 1
    lateinit var page: PdfDocument.Page
    lateinit var canvas: Canvas
    var y = margin

    fun startPage(titleSuffix: String? = null) {
      val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
      page = document.startPage(pageInfo)
      canvas = page.canvas
      canvas.drawColor(Color.WHITE)
      y = margin

      canvas.drawText(
          "Vendor Management Bill${titleSuffix?.let { " $it" } ?: ""}",
          margin,
          y,
          titlePaint)
      y += 26f
      canvas.drawText(
          "Order ${payload.orderNumber}  |  ${payload.createdAtLabel}",
          margin,
          y,
          subtlePaint)
      y += 18f
      canvas.drawLine(margin, y, pageWidth - margin, y, linePaint)
      y += 18f
    }

    fun finishPage() {
      document.finishPage(page)
      pageNumber += 1
    }

    fun ensureSpace(height: Float, continuationTitle: String? = "(cont.)") {
      if (y + height <= pageHeight - margin) {
        return
      }

      finishPage()
      startPage(continuationTitle)
    }

    fun wrapText(text: String, paint: Paint, maxWidth: Float): List<String> {
      if (text.isBlank()) {
        return listOf("")
      }

      val words = text.trim().split(Regex("\\s+"))
      val lines = mutableListOf<String>()
      var currentLine = ""

      for (word in words) {
        val candidate = if (currentLine.isBlank()) word else "$currentLine $word"

        if (paint.measureText(candidate) <= maxWidth) {
          currentLine = candidate
        } else {
          if (currentLine.isNotBlank()) {
            lines.add(currentLine)
          }
          currentLine = word
        }
      }

      if (currentLine.isNotBlank()) {
        lines.add(currentLine)
      }

      return lines.ifEmpty { listOf("") }
    }

    fun drawBlockLabel(label: String) {
      ensureSpace(18f, "(cont.)")
      canvas.drawText(label, margin, y, headingPaint)
      y += 18f
    }

    fun drawWrappedBlock(label: String, value: String) {
      drawBlockLabel(label)
      val lines = wrapText(value, bodyPaint, contentWidth)

      for (line in lines) {
        ensureSpace(18f, "(cont.)")
        canvas.drawText(line, margin, y, bodyPaint)
        y += 16f
      }

      y += 8f
    }

    startPage()

    drawBlockLabel("CUSTOMER")
    canvas.drawText(payload.customerName, margin, y, bodyPaintBold)
    y += 18f
    canvas.drawText("Account: ${payload.customerAccountId}", margin, y, subtlePaint)
    y += 16f
    canvas.drawText("Phone: ${payload.customerPhone}", margin, y, subtlePaint)
    y += 18f
    val addressLines = wrapText(payload.customerAddress, bodyPaint, contentWidth)
    for (line in addressLines) {
      ensureSpace(16f, "(cont.)")
      canvas.drawText(line, margin, y, bodyPaint)
      y += 16f
    }
    y += 10f

    drawWrappedBlock("SALESPERSON", payload.salespersonName)
    drawWrappedBlock("NOTES", payload.notes)

    ensureSpace(64f, "(cont.)")
    canvas.drawText("ITEM", itemColumnX, y, headingPaint)
    canvas.drawText("QTY", qtyColumnX, y, headingPaint)
    canvas.drawText("PRICE", priceColumnX, y, headingPaint)
    canvas.drawText("TOTAL", totalColumnX, y, headingPaint)
    y += 10f
    canvas.drawLine(margin, y, pageWidth - margin, y, linePaint)
    y += 18f

    payload.items.forEach { item ->
      val itemLines = wrapText(item.name, bodyPaintBold, qtyColumnX - itemColumnX - 12f)
      val requiredHeight = itemLines.size * 16f + 12f
      ensureSpace(requiredHeight + 16f, "(cont.)")

      itemLines.forEachIndexed { index, line ->
        canvas.drawText(
            line,
            itemColumnX,
            y,
            if (index == 0) bodyPaintBold else bodyPaint,
        )

        if (index == 0) {
          canvas.drawText(item.quantity.toString(), qtyColumnX, y, bodyPaint)
          canvas.drawText(currencyFormatter.format(item.unitPrice), priceColumnX, y, bodyPaint)
          canvas.drawText(currencyFormatter.format(item.lineTotal), totalColumnX, y, bodyPaintBold)
        }

        y += 16f
      }

      if (item.itemNumber.isNotBlank()) {
        canvas.drawText("SKU: ${item.itemNumber}", itemColumnX, y, subtlePaint)
        y += 14f
      }

      canvas.drawLine(margin, y, pageWidth - margin, y, linePaint)
      y += 14f
    }

    ensureSpace(110f, "(cont.)")
    y += 8f
    canvas.drawText("CREDITS", margin, y, headingPaint)
    canvas.drawText(currencyFormatter.format(payload.totalCredits), totalColumnX, y, bodyPaint)
    y += rowHeight
    canvas.drawText("DEPOSITS", margin, y, headingPaint)
    canvas.drawText(currencyFormatter.format(payload.totalDeposit), totalColumnX, y, bodyPaint)
    y += rowHeight
    canvas.drawLine(margin, y, pageWidth - margin, y, linePaint)
    y += 18f
    canvas.drawText("TOTAL PAYABLE", margin, y, titlePaint)
    canvas.drawText(
        currencyFormatter.format(payload.totalAmount),
        totalColumnX - 10f,
        y,
        titlePaint)

    finishPage()

    return ByteArrayOutputStream().use { outputStream ->
      document.writeTo(outputStream)
      document.close()
      outputStream.toByteArray()
    }
  }

  private fun openPdf(uri: Uri): Boolean {
    return try {
      UiThreadUtil.runOnUiThread {
        val openIntent =
            Intent(Intent.ACTION_VIEW).apply {
              setDataAndType(uri, "application/pdf")
              addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        val chooser = Intent.createChooser(openIntent, "Open generated bill").apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        reactApplicationContext.startActivity(chooser)
      }
      true
    } catch (error: ActivityNotFoundException) {
      false
    } catch (error: Exception) {
      false
    }
  }

  private fun savePdf(fileName: String, pdfBytes: ByteArray): Uri {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = reactApplicationContext.contentResolver
      val values =
          ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
            put(
                MediaStore.Downloads.RELATIVE_PATH,
                "${Environment.DIRECTORY_DOWNLOADS}/VendorManagement",
            )
          }

      val uri =
          resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
              ?: throw IOException("Unable to reserve a location for the PDF file.")

      resolver.openOutputStream(uri)?.use { outputStream ->
        outputStream.write(pdfBytes)
      } ?: throw IOException("Unable to write the generated PDF file.")

      return uri
    }

    val downloadsDirectory =
        File(reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "VendorManagement")
    if (!downloadsDirectory.exists() && !downloadsDirectory.mkdirs()) {
      throw IOException("Unable to create the local download directory.")
    }

    val file = File(downloadsDirectory, fileName)
    FileOutputStream(file).use { outputStream ->
      outputStream.write(pdfBytes)
    }

    MediaScannerConnection.scanFile(
        reactApplicationContext,
        arrayOf(file.absolutePath),
        arrayOf("application/pdf"),
        null)

    return FileProvider.getUriForFile(
        reactApplicationContext,
        "${reactApplicationContext.packageName}.fileprovider",
        file)
  }

  private fun downloadPdfToCache(request: RemotePdfRequest): File {
    if (request.url.isBlank()) {
      throw IOException("Receipt URL is missing.")
    }

    val cacheDirectory = File(reactApplicationContext.cacheDir, "receipts")
    if (!cacheDirectory.exists() && !cacheDirectory.mkdirs()) {
      throw IOException("Unable to prepare local storage for the receipt.")
    }

    val connection = URL(request.url).openConnection() as HttpURLConnection

    try {
      connection.connectTimeout = 15000
      connection.readTimeout = 30000
      connection.requestMethod = "GET"
      connection.setRequestProperty("Accept", "application/pdf")

      if (request.token.isNotBlank()) {
        connection.setRequestProperty("Authorization", "Bearer ${request.token}")
      }

      connection.connect()

      val responseCode = connection.responseCode
      if (responseCode !in 200..299) {
        throw IOException("Unable to download the receipt PDF. Server returned $responseCode.")
      }

      val fileName = resolvePdfFileName(connection, request.fileName, request.url)
      val outputFile = File(cacheDirectory, fileName)

      connection.inputStream.use { inputStream ->
        FileOutputStream(outputFile).use { outputStream ->
          inputStream.copyTo(outputStream)
        }
      }

      return outputFile
    } finally {
      connection.disconnect()
    }
  }

  private fun resolvePdfFileName(
      connection: HttpURLConnection,
      preferredFileName: String,
      urlValue: String,
  ): String {
    val contentDisposition = connection.getHeaderField("Content-Disposition").orEmpty()
    val headerFileName =
        contentDisposition
            .substringAfter("filename=", "")
            .trim()
            .trim('"')
    val urlFileName = Uri.parse(urlValue).lastPathSegment.orEmpty()
    val rawFileName =
        sequenceOf(preferredFileName, headerFileName, urlFileName, "receipt.pdf")
            .firstOrNull { it.isNotBlank() }
            ?: "receipt.pdf"
    val sanitizedFileName = sanitizeFileName(rawFileName)

    return if (sanitizedFileName.lowercase(Locale.US).endsWith(".pdf")) {
      sanitizedFileName
    } else {
      "$sanitizedFileName.pdf"
    }
  }

  private fun getFileContentUri(file: File): Uri =
      FileProvider.getUriForFile(
          reactApplicationContext,
          "${reactApplicationContext.packageName}.fileprovider",
          file)

  private fun formatCreatedAt(value: String): String {
    if (value.isBlank()) {
      return SimpleDateFormat("MMM dd, yyyy hh:mm a", Locale.US).format(Date())
    }

    val inputFormat =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
          timeZone = TimeZone.getTimeZone("UTC")
        }
    val outputFormat = SimpleDateFormat("MMM dd, yyyy hh:mm a", Locale.US)

    return try {
      outputFormat.format(inputFormat.parse(value) ?: Date())
    } catch (error: Exception) {
      value
    }
  }

  private fun sanitizeFileName(value: String): String =
      value.replace(Regex("[^A-Za-z0-9._-]"), "_")

  private fun ReadableArray.toBillItems(): List<BillItem> =
      (0 until size()).mapNotNull { index ->
        if (isNull(index)) {
          return@mapNotNull null
        }

        val item = getMap(index)

        BillItem(
            itemNumber = item.getOptionalString("itemNumber"),
            lineTotal = item.getOptionalDouble("lineTotal"),
            name = item.getOptionalString("name"),
            quantity = item.getOptionalInt("quantity"),
            unitPrice = item.getOptionalDouble("unitPrice"),
        )
      }

  private fun ReadableMap.toBillPayload(): BillPayload =
      BillPayload(
          createdAtLabel = formatCreatedAt(getOptionalString("createdAt")),
          customerAccountId = getOptionalString("customerAccountId"),
          customerAddress = getOptionalString("customerAddress"),
          customerName = getOptionalString("customerName"),
          customerPhone = getOptionalString("customerPhone"),
          items = getArray("items")?.toBillItems() ?: emptyList(),
          notes = getOptionalString("notes"),
          orderNumber = getOptionalString("orderNumber"),
          salespersonName = getOptionalString("salespersonName"),
          totalAmount = getOptionalDouble("totalAmount"),
          totalCredits = getOptionalDouble("totalCredits"),
          totalDeposit = getOptionalDouble("totalDeposit"),
      )

  private fun ReadableMap.toRemotePdfRequest(): RemotePdfRequest =
      RemotePdfRequest(
          fileName = getOptionalString("fileName"),
          jobName = getOptionalString("jobName"),
          token = getOptionalString("token"),
          url = getOptionalString("url"),
      )

  private fun ReadableMap.getOptionalDouble(key: String): Double =
      if (hasKey(key) && !isNull(key)) getDouble(key) else 0.0

  private fun ReadableMap.getOptionalInt(key: String): Int =
      if (hasKey(key) && !isNull(key)) getInt(key) else 0

  private fun ReadableMap.getOptionalString(key: String): String =
      if (hasKey(key) && !isNull(key)) getString(key) ?: "" else ""

  private data class BillItem(
      val itemNumber: String,
      val lineTotal: Double,
      val name: String,
      val quantity: Int,
      val unitPrice: Double,
  )

  private data class BillPayload(
      val createdAtLabel: String,
      val customerAccountId: String,
      val customerAddress: String,
      val customerName: String,
      val customerPhone: String,
      val items: List<BillItem>,
      val notes: String,
      val orderNumber: String,
      val salespersonName: String,
      val totalAmount: Double,
      val totalCredits: Double,
      val totalDeposit: Double,
  )

  private data class RemotePdfRequest(
      val fileName: String,
      val jobName: String,
      val token: String,
      val url: String,
  )

  private class PdfFilePrintAdapter(
      private val file: File,
      private val documentName: String,
  ) : PrintDocumentAdapter() {

    override fun onLayout(
        oldAttributes: PrintAttributes?,
        newAttributes: PrintAttributes,
        cancellationSignal: CancellationSignal,
        callback: LayoutResultCallback,
        extras: Bundle?,
    ) {
      if (cancellationSignal.isCanceled) {
        callback.onLayoutCancelled()
        return
      }

      val info =
          PrintDocumentInfo.Builder(documentName)
              .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
              .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
              .build()

      callback.onLayoutFinished(info, true)
    }

    override fun onWrite(
        pageRanges: Array<PageRange>,
        destination: ParcelFileDescriptor,
        cancellationSignal: CancellationSignal,
        callback: WriteResultCallback,
    ) {
      if (cancellationSignal.isCanceled) {
        callback.onWriteCancelled()
        return
      }

      try {
        FileInputStream(file).use { inputStream ->
          FileOutputStream(destination.fileDescriptor).use { outputStream ->
            inputStream.copyTo(outputStream)
          }
        }

        callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
      } catch (error: Exception) {
        callback.onWriteFailed(error.message)
      }
    }
  }
}
