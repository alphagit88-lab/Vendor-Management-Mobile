import {useEffect, useState} from 'react';

import {
  defaultLoginScreenContent,
  LOGIN_CONTENT_PREVIEW_MODE,
} from '../constants/loginContent';
import {authService} from '../services/authService';
import {loginContentService} from '../services/loginContentService';
import {
  ContentLoadState,
  LoginFormValues,
  LoginScreenContent,
  SubmitState,
} from '../types/auth';

const defaultFormValues: LoginFormValues = {
  identifier: '',
  password: '',
  rememberMe: true,
};

const validateForm = (values: LoginFormValues): string | null => {
  if (!values.identifier.trim() || !values.password.trim()) {
    return 'Add both your email or phone and password before signing in.';
  }

  return null;
};

export const useLoginScreen = () => {
  const startReady = LOGIN_CONTENT_PREVIEW_MODE === 'ready';
  const [contentState, setContentState] = useState<ContentLoadState>(
    startReady ? 'ready' : 'loading',
  );
  const [content, setContent] = useState<LoginScreenContent | null>(
    startReady ? defaultLoginScreenContent : null,
  );
  const [formValues, setFormValues] =
    useState<LoginFormValues>(defaultFormValues);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (startReady) {
      return;
    }

    let cancelled = false;

    const loadContent = async () => {
      setContentState('loading');

      try {
        const response = await loginContentService.fetch();

        if (cancelled) {
          return;
        }

        if (!response) {
          setContent(null);
          setContentState('empty');
          return;
        }

        setContent(response);
        setContentState('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }

        setContent(null);
        setContentState('error');
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load login content.',
        );
      }
    };

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [startReady]);

  const setIdentifier = (value: string) => {
    setFeedbackMessage(null);
    setSubmitState('idle');
    setFormValues(current => ({
      ...current,
      identifier: value,
    }));
  };

  const setPassword = (value: string) => {
    setFeedbackMessage(null);
    setSubmitState('idle');
    setFormValues(current => ({
      ...current,
      password: value,
    }));
  };

  const toggleRememberMe = () => {
    setFormValues(current => ({
      ...current,
      rememberMe: !current.rememberMe,
    }));
  };

  const retryContent = async () => {
    setFeedbackMessage(null);
    setContentState('loading');

    try {
      const response = await loginContentService.fetch();

      if (!response) {
        setContent(null);
        setContentState('empty');
        return;
      }

      setContent(response);
      setContentState('ready');
    } catch (error) {
      setContent(null);
      setContentState('error');
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load login content.',
      );
    }
  };

  const submit = async (): Promise<boolean> => {
    const validationMessage = validateForm(formValues);

    if (validationMessage) {
      setSubmitState('error');
      setFeedbackMessage(validationMessage);
      return false;
    }

    setSubmitState('loading');
    setFeedbackMessage(null);

    const response = await authService.login({
      identifier: formValues.identifier,
      password: formValues.password,
      rememberMe: formValues.rememberMe,
    });

    if (!response.ok) {
      setSubmitState('error');
      setFeedbackMessage(response.message ?? 'Unable to sign in.');
      return false;
    }

    setSubmitState('success');
    return true;
  };

  return {
    content: content ?? defaultLoginScreenContent,
    contentState,
    feedbackMessage,
    formValues,
    retryContent,
    setIdentifier,
    setPassword,
    submit,
    submitState,
    toggleRememberMe,
  };
};
