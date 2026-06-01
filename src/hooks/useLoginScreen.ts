import {useEffect, useState} from 'react';

import {authService} from '../services/authService';
import {authSessionStorageService} from '../services/authSessionStorageService';
import {rememberedCredentialsService} from '../services/rememberedCredentialsService';
import {AuthSession, LoginFormValues, SubmitState} from '../types/auth';

const defaultFormValues: LoginFormValues = {
  email: '',
  password: '',
};

const validateForm = (values: LoginFormValues): string | null => {
  if (!values.email.trim() || !values.password.trim()) {
    return 'Enter both your email address and password.';
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(values.email.trim())) {
    return 'Enter a valid email address.';
  }

  return null;
};

export const useLoginScreen = () => {
  const [formValues, setFormValues] =
    useState<LoginFormValues>(defaultFormValues);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const hydrateRememberedCredentials = async () => {
      const rememberedCredentials = await rememberedCredentialsService.load();

      if (!isActive || !rememberedCredentials) {
        return;
      }

      setFormValues(current =>
        current.email || current.password ? current : rememberedCredentials,
      );
      setRememberMe(true);
    };

    hydrateRememberedCredentials();

    return () => {
      isActive = false;
    };
  }, []);

  const setEmail = (value: string) => {
    setFeedbackMessage(null);
    setSubmitState('idle');
    setFormValues(current => ({
      ...current,
      email: value,
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
    setFeedbackMessage(null);
    setSubmitState('idle');

    setRememberMe(current => {
      const nextValue = !current;

      if (!nextValue) {
        rememberedCredentialsService.clear();
      }

      return nextValue;
    });
  };

  const submit = async (): Promise<AuthSession | null> => {
    const validationMessage = validateForm(formValues);

    if (validationMessage) {
      setSubmitState('error');
      setFeedbackMessage(validationMessage);
      return null;
    }

    setSubmitState('loading');
    setFeedbackMessage(null);

    const response = await authService.login({
      email: formValues.email,
      password: formValues.password,
    });

    if (!response.ok || !response.data) {
      setSubmitState('error');
      setFeedbackMessage(response.message ?? 'Unable to sign in.');
      return null;
    }

    setSubmitState('success');

    if (rememberMe) {
      await rememberedCredentialsService.save(formValues);
    } else {
      await rememberedCredentialsService.clear();
    }
    await authSessionStorageService.save(response.data);

    return response.data;
  };

  return {
    feedbackMessage,
    formValues,
    rememberMe,
    setEmail,
    setPassword,
    submit,
    submitState,
    toggleRememberMe,
  };
};
