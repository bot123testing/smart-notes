/**
 * useMotion.js — Reusable Reanimated v3 motion utilities.
 * All hooks are Rules-of-Hooks compliant (no hooks in loops or nested functions).
 */
import {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    withSequence,
    cancelAnimation,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { useEffect } from 'react';

/* ── Spring-animated scale ──────────────────────────────────────────────────
 * Returns { scaleStyle, scale, press, release }
 */
export function useSpringScale(initial = 1, config = {}) {
    const ds = { damping: 14, stiffness: 180, ...config };
    const scale = useSharedValue(initial);

    const scaleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const press = () => { scale.value = withSpring(initial * 0.93, ds); };
    const release = () => { scale.value = withSpring(initial, ds); };

    return { scale, scaleStyle, press, release };
}

/* ── Fade + slide entrance ──────────────────────────────────────────────────
 * direction: 'up' | 'down' | 'left' | 'right'
 * Returns { style, trigger }
 */
export function useFadeSlide(direction = 'up', delay = 0, distance = 18) {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(
        direction === 'up' || direction === 'down' ? (direction === 'up' ? distance : -distance) : 0,
    );
    const translateX = useSharedValue(
        direction === 'left' ? distance : direction === 'right' ? -distance : 0,
    );

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateY: translateY.value },
            { translateX: translateX.value },
        ],
    }));

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 320 + delay });
        translateY.value = withSpring(0, { damping: 14, stiffness: 160 });
        translateX.value = withSpring(0, { damping: 14, stiffness: 160 });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return { style, opacity };
}

/* ── Staggered list animation ───────────────────────────────────────────────
 * RULES-OF-HOOKS COMPLIANT: fixed max 20 items, no hooks in loops.
 * Returns getEntering(index) — pass to Animated.View `entering` prop.
 *
 * Usage: <Animated.View entering={FadeInDown.delay(index * stagger).springify()}>
 * (This hook is kept for API completeness but the entering-prop pattern is simpler.)
 */
export function useStaggeredList(stagger = 55, baseDelay = 0) {
    // Pre-allocate 20 shared values (max list items supported)
    const sv0 = useSharedValue(0);
    const sv1 = useSharedValue(0);
    const sv2 = useSharedValue(0);
    const sv3 = useSharedValue(0);
    const sv4 = useSharedValue(0);
    const sv5 = useSharedValue(0);
    const sv6 = useSharedValue(0);
    const sv7 = useSharedValue(0);
    const sv8 = useSharedValue(0);
    const sv9 = useSharedValue(0);
    const sv10 = useSharedValue(0);
    const sv11 = useSharedValue(0);
    const sv12 = useSharedValue(0);
    const sv13 = useSharedValue(0);
    const sv14 = useSharedValue(0);
    const sv15 = useSharedValue(0);
    const sv16 = useSharedValue(0);
    const sv17 = useSharedValue(0);
    const sv18 = useSharedValue(0);
    const sv19 = useSharedValue(0);

    const svs = [
        sv0, sv1, sv2, sv3, sv4, sv5, sv6, sv7, sv8, sv9,
        sv10, sv11, sv12, sv13, sv14, sv15, sv16, sv17, sv18, sv19,
    ];

    useEffect(() => {
        svs.forEach((p, i) => {
            p.value = withTiming(1, { duration: 420 + baseDelay + i * stagger });
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Return delays in ms so callers can use the entering-prop pattern
    const getDelay = (index) => baseDelay + index * stagger;

    return { getDelay };
}

/* ── Pulse glow (looping) ───────────────────────────────────────────────────
 * Returns { glowOpacity, glowStyle }
 */
export function usePulseGlow(speed = 1200) {
    const opacity = useSharedValue(0.3);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.95, { duration: speed }),
                withTiming(0.3, { duration: speed }),
            ),
            -1,
            true,
        );
        return () => cancelAnimation(opacity);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const glowStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return { glowOpacity: opacity, glowStyle };
}

/* ── Counter animation ──────────────────────────────────────────────────────
 * Returns a sharedValue that animates from 0 → target.
 */
export function useAnimatedCounter(target, duration = 900) {
    const value = useSharedValue(0);

    useEffect(() => {
        value.value = withTiming(target, { duration });
    }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

    return value;
}
