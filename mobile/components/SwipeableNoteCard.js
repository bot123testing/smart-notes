import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated as RNAnimated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Trash2 } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import { spacing, layout, typography } from '../theme/theme';
import NoteCard from './NoteCard';

const SwipeableNoteCard = ({ note, onPress, onDelete }) => {
    const { theme } = useTheme();
    const swipeableRef = useRef(null);

    const renderRightActions = (progress, dragX) => {
        const scale = dragX.interpolate({
            inputRange: [-80, -40, 0],
            outputRange: [1, 0.8, 0.5],
            extrapolate: 'clamp',
        });
        const opacity = dragX.interpolate({
            inputRange: [-80, -20, 0],
            outputRange: [1, 0.8, 0],
            extrapolate: 'clamp',
        });

        const handleDelete = () => {
            swipeableRef.current?.close();
            onDelete(note.id);
        };

        return (
            <TouchableOpacity
                onPress={handleDelete}
                style={[styles.deleteAction, { backgroundColor: theme.danger }]}
                activeOpacity={0.8}
            >
                <RNAnimated.View style={{ transform: [{ scale }], opacity }}>
                    <Trash2 size={22} color="#FFFFFF" />
                    <RNAnimated.Text style={[styles.deleteLabel, { opacity }]}>Delete</RNAnimated.Text>
                </RNAnimated.View>
            </TouchableOpacity>
        );
    };

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            friction={2}
            overshootRight={false}
            rightThreshold={40}
            containerStyle={styles.swipeContainer}
        >
            <NoteCard
                note={note}
                onPress={onPress}
                onLongPress={() => onDelete(note.id)}
            />
        </Swipeable>
    );
};

const styles = StyleSheet.create({
    swipeContainer: {
        marginHorizontal: spacing.md,
        marginBottom: spacing.md,
        borderRadius: layout.radius,
        overflow: 'hidden',
    },
    deleteAction: {
        width: 80,
        justifyContent: 'center',
        alignItems: 'center',
        borderTopRightRadius: layout.radius,
        borderBottomRightRadius: layout.radius,
    },
    deleteLabel: {
        color: '#FFF',
        ...typography.label,
        marginTop: 4,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});

export default SwipeableNoteCard;
