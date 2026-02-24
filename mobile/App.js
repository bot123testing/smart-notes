import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, AuthContext } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';
import AddNoteScreen from './screens/AddNoteScreen';
import EditNoteScreen from './screens/EditNoteScreen';
import GraphScreen from './screens/GraphScreen';
import { ActivityIndicator, View } from 'react-native';

const Stack = createNativeStackNavigator();

const AppStack = () => {
  const { userToken, isLoading } = React.useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {userToken == null ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'My Notes' }} />
          <Stack.Screen name="AddNote" component={AddNoteScreen} options={{ title: 'New Note' }} />
          <Stack.Screen name="EditNote" component={EditNoteScreen} options={({ route }) => ({ title: route.params?.note?.title || 'Edit Note' })} />
          <Stack.Screen name="Graph" component={GraphScreen} options={{ title: 'Knowledge Graph', headerStyle: { backgroundColor: '#0f0c29' }, headerTintColor: '#fff' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppStack />
      </NavigationContainer>
    </AuthProvider>
  );
}
