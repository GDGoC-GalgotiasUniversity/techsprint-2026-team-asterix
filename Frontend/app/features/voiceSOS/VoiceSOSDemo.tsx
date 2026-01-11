import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import useVoiceSOS from './useVoiceSOS';

export default function VoiceSOSDemo() {
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    const { startListening, stopListening, isListening, isModelReady } = useVoiceSOS({
        onKeywordDetected: (info) => {
            addLog(`🚨 KEYWORD DETECTED: "${info.keyword}" (${(info.confidence * 100).toFixed(1)}%)`);
            Alert.alert('SOS Triggered', `Detected "${info.keyword}" with confidence ${info.confidence}`);
        },
        onError: (error) => {
            addLog(`❌ Error: ${error.message || error}`);
        }
    });

    const handleStart = () => {
        addLog('Starting listener...');
        startListening();
    };

    const handleStop = () => {
        addLog('Stopping listener...');
        stopListening();
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Voice SOS Demo</Text>

            <View style={styles.statusContainer}>
                <Text style={styles.statusText}>
                    Status: {isListening ? '🎤 Listening' : 'zzz Idle'}
                </Text>
                <Text style={styles.statusText}>
                    Model: {isModelReady ? '✅ Ready' : '⏳ Loading...'}
                </Text>
            </View>

            <View style={styles.controls}>
                <TouchableOpacity
                    style={[styles.button, styles.startButton, isListening && styles.disabledButton]}
                    onPress={handleStart}
                    disabled={isListening}
                >
                    <Text style={styles.buttonText}>Start Listening</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, styles.stopButton, !isListening && styles.disabledButton]}
                    onPress={handleStop}
                    disabled={!isListening}
                >
                    <Text style={styles.buttonText}>Stop Listening</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.logsTitle}>Logs:</Text>
            <ScrollView style={styles.logsContainer}>
                {logs.map((log, index) => (
                    <Text key={index} style={styles.logText}>{log}</Text>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    statusContainer: {
        marginBottom: 20,
        padding: 15,
        backgroundColor: 'white',
        borderRadius: 10,
        elevation: 2,
    },
    statusText: {
        fontSize: 16,
        marginBottom: 5,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        minWidth: 120,
        alignItems: 'center',
    },
    startButton: {
        backgroundColor: '#4CAF50',
    },
    stopButton: {
        backgroundColor: '#F44336',
    },
    disabledButton: {
        backgroundColor: '#ccc',
        opacity: 0.7,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    logsTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    logsContainer: {
        flex: 1,
        backgroundColor: 'white',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    logText: {
        fontSize: 12,
        marginBottom: 4,
        fontFamily: 'monospace',
    },
});
