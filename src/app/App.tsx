import React from 'react';
import {StatusBar} from 'react-native';

import {LoginScreen} from '../screens/LoginScreen';
import {palette} from '../theme/colors';

const App = (): React.JSX.Element => {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
      <LoginScreen />
    </>
  );
};

export default App;
