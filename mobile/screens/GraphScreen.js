import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, PanResponder, Animated, Dimensions, TouchableOpacity } from 'react-native';
import Svg, { G, Circle, Line, Text as SvgText, Rect } from 'react-native-svg';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

// ── Layout: simple circle layout ──────────────────────────────────────────────
function applyCircleLayout(nodes) {
    const radius = Math.max(120, nodes.length * 25);
    const n = nodes.length;
    // Center of the logical canvas
    const cx = 0;
    const cy = 0;

    return nodes.map((node, i) => {
        const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
        return {
            ...node,
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        };
    });
}

// ── Decay colour helper ───────────────────────────────────────────────────────
function decayColor(decay) {
    if (decay >= 0.6) return { fill: '#fee2e2', stroke: '#ef4444', text: '#991b1b' };
    if (decay >= 0.3) return { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' };
    return { fill: '#dcfce7', stroke: '#22c55e', text: '#166534' };
}

export default function GraphScreen({ navigation }) {
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(true);

    // Pan and Zoom state
    const pan = useRef(new Animated.ValueXY({ x: width / 2, y: height / 2 })).current;
    const scale = useRef(new Animated.Value(1)).current;

    // Track current scale for PanResponder boundaries
    const [currentScale, setCurrentScale] = useState(1);
    scale.addListener(({ value }) => setCurrentScale(value));

    // Ref to hold previous touch distance for pinch-to-zoom
    const prevDistanceRef = useRef(null);

    const fetchGraph = async () => {
        try {
            const res = await api.get('/notes/graph');
            const { nodes, edges } = res.data;
            const laidOutNodes = applyCircleLayout(nodes);
            setGraphData({ nodes: laidOutNodes, edges });
        } catch (error) {
            console.error('Failed to fetch graph data:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchGraph();
        }, [])
    );

    // ── Pan and Pinch-to-Zoom ─────────────────────────────────────────────────
    function getDistance(touches) {
        const [touch1, touch2] = touches;
        const dx = touch1.pageX - touch2.pageX;
        const dy = touch1.pageY - touch2.pageY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,

            onPanResponderGrant: (evt, gestureState) => {
                pan.setOffset({
                    x: pan.x._value,
                    y: pan.y._value,
                });
                pan.setValue({ x: 0, y: 0 });
                if (evt.nativeEvent.touches.length === 2) {
                    prevDistanceRef.current = getDistance(evt.nativeEvent.touches);
                }
            },

            onPanResponderMove: (evt, gestureState) => {
                const touches = evt.nativeEvent.touches;
                if (touches.length === 2) {
                    // Pinch to zoom
                    const distance = getDistance(touches);
                    if (prevDistanceRef.current) {
                        const scaleDelta = distance / prevDistanceRef.current;
                        let newScale = scale._value * scaleDelta;
                        // clamp scale
                        if (newScale < 0.3) newScale = 0.3;
                        if (newScale > 3) newScale = 3;
                        scale.setValue(newScale);
                    }
                    prevDistanceRef.current = distance;
                } else if (touches.length === 1 && !prevDistanceRef.current) {
                    // Pan
                    pan.setValue({ x: gestureState.dx, y: gestureState.dy });
                }
            },

            onPanResponderRelease: () => {
                pan.flattenOffset();
                prevDistanceRef.current = null;
            },
            onPanResponderTerminate: () => {
                pan.flattenOffset();
                prevDistanceRef.current = null;
            },
        })
    ).current;

    const handleNodePress = async (nodeId) => {
        try {
            const res = await api.get(`/notes/${nodeId}`);
            navigation.navigate('EditNote', { note: res.data });
        } catch (e) {
            console.error('Could not open note from graph', e);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>Loading Graph...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.legend}>
                <Text style={styles.legendTitle}>🧠 Knowledge Graph</Text>
                <Text style={styles.legendSub}>{graphData.nodes.length} notes · {graphData.edges.length} links</Text>
                <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
                    <Text style={styles.legendLabel}>Fresh</Text>
                    <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                    <Text style={styles.legendLabel}>Fading</Text>
                    <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                    <Text style={styles.legendLabel}>Review</Text>
                </View>
            </View>

            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.canvas,
                    {
                        transform: [
                            { translateX: pan.x },
                            { translateY: pan.y },
                            { scale: scale }
                        ]
                    }
                ]}
            >
                {/* SVG canvas large enough to hold the nodes (logical coords center is 0,0) */}
                <Svg width={4000} height={4000} viewBox="-2000 -2000 4000 4000">
                    <G>
                        {/* Render edges */}
                        {graphData.edges.map((edge, index) => {
                            const sourceNode = graphData.nodes.find(n => n.id === edge.source);
                            const targetNode = graphData.nodes.find(n => n.id === edge.target);
                            if (!sourceNode || !targetNode) return null;
                            return (
                                <Line
                                    key={`edge-${index}`}
                                    x1={sourceNode.x}
                                    y1={sourceNode.y}
                                    x2={targetNode.x}
                                    y2={targetNode.y}
                                    stroke="#818cf8"
                                    strokeWidth="2"
                                    strokeOpacity="0.6"
                                />
                            );
                        })}

                        {/* Render nodes */}
                        {graphData.nodes.map(node => {
                            const colors = decayColor(node.memory_decay);
                            const nodeRadius = 35;
                            return (
                                <G
                                    key={`node-${node.id}`}
                                    x={node.x}
                                    y={node.y}
                                    onPress={() => handleNodePress(node.id)}
                                >
                                    <Circle
                                        r={nodeRadius}
                                        fill={colors.fill}
                                        stroke={colors.stroke}
                                        strokeWidth="3"
                                    />
                                    {/* Title background for readability */}
                                    <Rect
                                        x="-40" y="-10" width="80" height="20"
                                        fill="rgba(255,255,255,0.7)"
                                        rx="4"
                                    />
                                    <SvgText
                                        fill="#1e1b4b"
                                        fontSize="12"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        alignmentBaseline="middle"
                                    >
                                        {node.title.length > 12 ? node.title.substring(0, 10) + '...' : node.title}
                                    </SvgText>

                                    <SvgText
                                        y="25"
                                        fill={colors.text}
                                        fontSize="10"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        alignmentBaseline="middle"
                                    >
                                        {Math.round((node.memory_decay || 0) * 100)}% decay
                                    </SvgText>
                                </G>
                            );
                        })}
                    </G>
                </Svg>
            </Animated.View>
            <View style={styles.controls}>
                <Text style={styles.hint}>Pinch to zoom, drag to pan</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f0c29', // dark space theme similar to web
        overflow: 'hidden',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#a5b4fc',
        fontSize: 16,
    },
    canvas: {
        // large area to accept touches
        width: 4000,
        height: 4000,
        position: 'absolute',
        // Center the 4000x4000 canvas at 0,0 locally
        left: -2000 + width / 2,
        top: -2000 + height / 2,
    },
    legend: {
        position: 'absolute',
        top: 40,
        left: 20,
        backgroundColor: 'rgba(30,27,75,0.85)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#4338ca',
        zIndex: 10,
    },
    legendTitle: { color: '#e0e7ff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    legendSub: { color: '#a5b4fc', fontSize: 12, marginBottom: 8 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { color: '#c7d2fe', fontSize: 11, marginRight: 4 },

    controls: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
        backgroundColor: 'rgba(30,27,75,0.7)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    hint: {
        color: '#a5b4fc',
        fontSize: 12,
    }
});
