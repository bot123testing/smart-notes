import { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';

const HEADER_MAX_HEIGHT = 140;
const HEADER_MIN_HEIGHT = 60;

/**
 * Returns scroll handler and animated styles for a collapsible header.
 * @param {number} maxHeight - Maximum expanded height (default 140)
 * @param {number} minHeight - Collapsed height (default 60)
 */
export const useAnimatedHeader = (maxHeight = HEADER_MAX_HEIGHT, minHeight = HEADER_MIN_HEIGHT) => {
    const scrollY = useSharedValue(0);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            'worklet';
            scrollY.value = event.contentOffset.y;
        },
    });

    const headerAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        const height = interpolate(
            scrollY.value,
            [0, maxHeight - minHeight],
            [maxHeight, minHeight],
            Extrapolation.CLAMP
        );
        return { height };
    });

    const titleAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        const opacity = interpolate(
            scrollY.value,
            [0, (maxHeight - minHeight) * 0.5],
            [1, 0],
            Extrapolation.CLAMP
        );
        const translateY = interpolate(
            scrollY.value,
            [0, maxHeight - minHeight],
            [0, -10],
            Extrapolation.CLAMP
        );
        return { opacity, transform: [{ translateY }] };
    });

    const miniTitleAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        const opacity = interpolate(
            scrollY.value,
            [(maxHeight - minHeight) * 0.5, maxHeight - minHeight],
            [0, 1],
            Extrapolation.CLAMP
        );
        return { opacity };
    });

    return { scrollY, scrollHandler, headerAnimatedStyle, titleAnimatedStyle, miniTitleAnimatedStyle };
};
