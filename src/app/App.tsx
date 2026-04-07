import React, {useState} from 'react';
import {StatusBar} from 'react-native';

import {HomeScreen} from '../screens/HomeScreen';
import {LoginScreen} from '../screens/LoginScreen';
import {AuthSession} from '../types/auth';

const App = (): React.JSX.Element => {
  const [session, setSession] = useState<AuthSession | null>(null);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFF" />
      {session ? (
        <HomeScreen session={session} />
      ) : (
        <LoginScreen onAuthenticated={setSession} />
      )}
    </>
  );
};

export default App;
