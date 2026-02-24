import React, { useState, useContext } from 'react';
import { View, TextInput, Button, StyleSheet, Text, Alert } from 'react-native';
import { AuthContext } from '../context/AuthContext';

const RegisterScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { signUp } = useContext(AuthContext);

    const handleRegister = async () => {
        try {
            await signUp(email, password);
            Alert.alert('Success', 'Account created. Please login.');
            navigation.navigate('Login');
        } catch (e) {
            Alert.alert('Registration Failed', e.message);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Create Account</Text>
            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
            />
            <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />
            <Button title="Register" onPress={handleRegister} />
            <View style={styles.link}>
                <Button
                    title="Back to Login"
                    onPress={() => navigation.navigate('Login')}
                    color="#888"
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 12, paddingHorizontal: 10, borderRadius: 5 },
    link: { marginTop: 10 }
});

export default RegisterScreen;
