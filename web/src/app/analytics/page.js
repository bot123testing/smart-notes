'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { useRouter } from 'next/navigation';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export default function AnalyticsPage() {
    const { userToken } = useAuth();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [graph, setGraph] = useState(null);
    const [timeline, setTimeline] = useState(null);

    const loadData = useCallback(async () => {
        if (!userToken) return;
        setLoading(true);
        try {
            const [statsRes, graphRes, timelineRes] = await Promise.all([
                api.get('/activity/stats'),
                api.get('/notes/graph'),
                api.get('/activity/timeline')
            ]);
            setStats(statsRes.data);
            setGraph(graphRes.data);
            setTimeline(timelineRes.data);
        } catch (err) {
            console.error('Failed to load analytics', err);
        } finally {
            setLoading(false);
        }
    }, [userToken]);

    useEffect(() => {
        if (!userToken) { router.push('/login'); return; }
        loadData();
    }, [userToken]);

    // -- Data Processing for Charts ---------------------------------------------

    // 1. Bar Chart: Most Active Topics (Top 6 notes by total events)
    const activeTopicsData = {
        labels: [],
        datasets: [{
            label: 'Activity Events (Views + Edits)',
            data: [],
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    if (stats && stats.notes) {
        // Sort descending by total events, take top 6
        const topActive = [...stats.notes].sort((a, b) => b.total - a.total).slice(0, 6);
        activeTopicsData.labels = topActive.map(n => n.note_title.length > 15 ? n.note_title.substring(0, 15) + '...' : n.note_title);
        activeTopicsData.datasets[0].data = topActive.map(n => n.total);
    }

    // 2. Line Chart: Knowledge Growth (Cumulative count over time)
    const growthData = {
        labels: [],
        datasets: [{
            label: 'Total Notes Created',
            data: [],
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#22c55e',
        }],
    };

    if (timeline && timeline.timeline) {
        growthData.labels = timeline.timeline.map(t => new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        growthData.datasets[0].data = timeline.timeline.map(t => t.count);
    }

    // 3. Doughnut Chart: Most Connected Notes (Top 5 by outbound links)
    const connectionsData = {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: [
                'rgba(99, 102, 241, 0.8)', // Indigo
                'rgba(245, 158, 11, 0.8)', // Amber
                'rgba(16, 185, 129, 0.8)', // Emerald
                'rgba(239, 68, 68, 0.8)',  // Red
                'rgba(168, 85, 247, 0.8)', // Purple
            ],
            borderWidth: 0,
            hoverOffset: 4
        }]
    };

    if (graph && graph.nodes) {
        const topConnected = [...graph.nodes]
            .filter(n => n.link_count > 0)
            .sort((a, b) => b.link_count - a.link_count)
            .slice(0, 5);

        connectionsData.labels = topConnected.map(n => n.title.length > 15 ? n.title.substring(0, 15) + '...' : n.title);
        connectionsData.datasets[0].data = topConnected.map(n => n.link_count);
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        color: '#c7d2fe', // legend text color
        plugins: {
            legend: { labels: { color: '#c7d2fe', padding: 20 } }
        },
        scales: {
            x: {
                ticks: { color: '#818cf8', maxRotation: 45, minRotation: 45 },
                grid: { color: 'rgba(67, 56, 202, 0.2)' }
            },
            y: {
                ticks: { color: '#818cf8', precision: 0 }, // integers only
                grid: { color: 'rgba(67, 56, 202, 0.2)' },
                beginAtZero: true
            }
        }
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        color: '#c7d2fe',
        plugins: {
            legend: { position: 'right', labels: { color: '#c7d2fe', padding: 20 } }
        },
        cutout: '65%',
    };

    if (!userToken) return null;

    return (
        <div style={{ minHeight: '100vh', background: '#0f0c29', color: '#e0e7ff', fontFamily: 'Inter, system-ui, sans-serif' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid #312e81', background: 'rgba(30,27,75,0.7)' }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📉 Analytics Dashboard</h1>
                <button
                    onClick={() => router.push('/')}
                    style={{
                        background: 'transparent',
                        border: '1px solid #4338ca',
                        color: '#a5b4fc',
                        padding: '8px 16px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600
                    }}
                >
                    ← Back to Notes
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#818cf8' }}>
                    Loading your insights...
                </div>
            ) : (
                <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>

                    {/* Summary Stats Row */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 32 }}>
                        <StatCard title="Total Events Logged" value={stats?.total_events || 0} icon="⚡" />
                        <StatCard title="Notes in Hive" value={graph?.nodes.length || 0} icon="📝" />
                        <StatCard title="Total Manual Links" value={graph?.edges.length || 0} icon="🔗" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24, marginBottom: 24 }}>
                        {/* Main Line Chart - Growth */}
                        <div style={{ background: 'rgba(30,27,75,0.6)', borderRadius: 12, padding: 24, border: '1px solid #312e81' }}>
                            <h2 style={{ fontSize: 16, margin: '0 0 20px 0', color: '#c7d2fe' }}>📈 Knowledge Growth Over Time</h2>
                            <div style={{ height: 300 }}>
                                <Line data={growthData} options={chartOptions} />
                            </div>
                        </div>

                        {/* Doughnut Chart - Connections */}
                        <div style={{ background: 'rgba(30,27,75,0.6)', borderRadius: 12, padding: 24, border: '1px solid #312e81' }}>
                            <h2 style={{ fontSize: 16, margin: '0 0 20px 0', color: '#c7d2fe' }}>🕸️ Most Connected Notes</h2>
                            <div style={{ height: 300 }}>
                                {connectionsData.datasets[0].data.length > 0 ? (
                                    <Doughnut data={connectionsData} options={doughnutOptions} />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                                        No manual links yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Bar Chart - Activity */}
                    <div style={{ background: 'rgba(30,27,75,0.6)', borderRadius: 12, padding: 24, border: '1px solid #312e81' }}>
                        <h2 style={{ fontSize: 16, margin: '0 0 20px 0', color: '#c7d2fe' }}>🔥 Most Active Topics (Views + Edits)</h2>
                        <div style={{ height: 280 }}>
                            <Bar data={activeTopicsData} options={chartOptions} />
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, icon }) {
    return (
        <div style={{
            flex: 1, background: 'linear-gradient(135deg, rgba(49,46,129,0.8), rgba(30,27,75,0.9))',
            padding: '24px', borderRadius: 12, border: '1px solid #4338ca',
            display: 'flex', alignItems: 'center', gap: 16
        }}>
            <div style={{ fontSize: 32 }}>{icon}</div>
            <div>
                <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#e0e7ff' }}>{value}</div>
            </div>
        </div>
    );
}
