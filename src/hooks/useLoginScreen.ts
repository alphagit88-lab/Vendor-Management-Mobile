import {useState} from 'react';

import {authService} from '../services/authService';
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
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

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
    return response.data;
  };

  return {
    feedbackMessage,
    formValues,
    setEmail,
    setPassword,
    submit,
    submitState,
  };
};
