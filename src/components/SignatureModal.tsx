import React, { useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { palette } from '../theme/colors';
import { radii } from '../theme/shape';
import { spacing } from '../theme/spacing';

const ui = {
  textHeading: '#203127',
  textBody: '#45564C',
  textMuted: '#738278',
  cardBorder: '#D9E4D3',
  cardBorderStrong: '#C4D5BC',
  softSurface: '#F7FAF1',
  softSurfaceStrong: '#EEF4E6',
};

interface SignatureModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (base64: string) => void;
  title: string;
}

const SignatureModal: React.FC<SignatureModalProps> = ({
  isVisible,
  onClose,
  onSave,
  title,
}) => {
  const signatureRef = useRef<SignatureViewRef>(null);

  const handleOK = (signature: string) => {
    onSave(signature);
    onClose();
  };

  const handleClear = () => {
    signatureRef.current?.clearSignature();
  };

  const handleConfirm = () => {
    signatureRef.current?.readSignature();
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.canvasContainer}>
          <SignatureScreen
            ref={signatureRef}
            onOK={handleOK}
            style={{ flex: 1 }}
            descriptionText={`Please sign above the line for ${title}`}
            clearText="Clear"
            confirmText="Save"
            webStyle={`
              .m-signature-pad { 
                box-shadow: none; 
                border: none; 
                background-color: transparent;
              }
              .m-signature-pad--body {
                border-bottom: 2px dashed #CBD5E1;
              }
              .m-signature-pad--footer { 
                display: none; 
              }
              body, html {
                height: 100%;
                width: 100%;
                background-color: transparent;
              }
            `}
            autoClear={false}
          />
          <View style={styles.signHerePrompt}>
            <Text style={styles.signHereText}>X ___________________________________</Text>
            <Text style={styles.signHereSubtext}>Sign on the line above</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={handleClear}
          >
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleConfirm}
          >
            <Text style={styles.saveButtonText}>Save Signature</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.softSurface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: palette.white,
    borderBottomWidth: 1,
    borderBottomColor: ui.cardBorder,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '900',
    color: ui.textHeading,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  canvasContainer: {
    height: 250,
    margin: spacing.lg,
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: ui.cardBorder,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    position: 'relative',
  },
  signHerePrompt: {
    position: 'absolute',
    bottom: 20, // Lowered to align with the bottom of the canvas
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  signHereText: {
    fontSize: 20,
    color: ui.cardBorderStrong,
    fontWeight: '300',
  },
  signHereSubtext: {
    fontSize: 10,
    color: ui.textMuted,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    backgroundColor: ui.softSurfaceStrong,
  },
  saveButton: {
    backgroundColor: palette.primaryStrong,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textBody,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.white,
  },
});

export default SignatureModal;
