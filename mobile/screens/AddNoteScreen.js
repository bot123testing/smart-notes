import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Alert } from 'react-native';
import api from '../services/api';

const AddNoteScreen = ({ navigation }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    const handleSave = async () => {
        if (!title || !content) {
            Alert.alert('Error', 'Please fill in both fields');
            return;
        }
        try {
            await api.post('/notes/', { title, content });
            navigation.goBack();
        } catch (error) {
            Alert.alert('Error', 'Could not save note');
            console.error(error);
        }
    };

    return (
        <View style={styles.container}>
            <TextInput
                style={styles.inputTitle}
                placeholder="Title"
                value={title}
                onChangeText={setTitle}
            />
            <TextInput
                style={[styles.inputContent, { textAlignVertical: 'top' }]}
                placeholder="Write your note..."
                value={content}
                onChangeText={setContent}
                multiline
            />
            <Button title="Save Note" onPress={handleSave} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: 'white' },
    inputTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
    inputContent: { flex: 1, fontSize: 16, marginBottom: 20 }
});

export default AddNoteScreen;
