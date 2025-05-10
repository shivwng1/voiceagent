'use client'
import { RealTimeAudioPlayer } from '@/services/RealTimeAudioPlayer';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, MoreVertical } from 'lucide-react'
import SoundWave from '@/components/SoundWave';
import { useRouter, useSearchParams } from 'next/navigation';
import { audioContext, base64ToArrayBuffer } from '@/utils/utils';
import { AudioStreamer } from '@/services/audioStreamer';
import VolMeterWorket from '@/services/workers/volMeter';
import { nanoid } from "nanoid";
import { WavStreamPlayer } from "wavtools";

export class Utils {
  /**
   * Converts Float32Array of amplitude data to ArrayBuffer in Int16Array format
   * @param {Float32Array} float32Array
   * @returns {ArrayBuffer}
   */
  static floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }
  /**
   * Converts a base64 string to an ArrayBuffer
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  static base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  /**
   * Converts an ArrayBuffer, Int16Array or Float32Array to a base64 string
   * @param {ArrayBuffer|Int16Array|Float32Array} arrayBuffer
   * @returns {string}
   */
  static arrayBufferToBase64(arrayBuffer) {
    if (arrayBuffer instanceof Float32Array) {
      arrayBuffer = this.floatTo16BitPCM(arrayBuffer);
    } else if (arrayBuffer instanceof Int16Array) {
      arrayBuffer = new Int16Array(arrayBuffer).buffer;
    }
    let binary = "";
    let bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000; // 32KB chunk size
    for (let i = 0; i < bytes.length; i += chunkSize) {
      let chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
  /**
   * Merge two Int16Arrays from Int16Arrays or ArrayBuffers
   * @param {ArrayBuffer|Int16Array} left
   * @param {ArrayBuffer|Int16Array} right
   * @returns {Int16Array}
   */
  static mergeInt16Arrays(left, right) {
    if (left instanceof ArrayBuffer) {
      left = new Int16Array(left);
    }
    if (right instanceof ArrayBuffer) {
      right = new Int16Array(right);
    }
    if (!(left instanceof Int16Array) || !(right instanceof Int16Array)) {
      throw new Error(`Both items must be Int16Array`);
    }
    const newValues = new Int16Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) {
      newValues[i] = left[i];
    }
    for (let j = 0; j < right.length; j++) {
      newValues[left.length + j] = right[j];
    }
    return newValues;
  }
  /**
   * Generates an id to send with events and messages
   * @param {string} prefix
   * @param {number} [length]
   * @returns {string}
   */
  static generateId(prefix, length = 21) {
    // base58; non-repeating chars
    const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const str = Array(length - prefix.length)
      .fill(0)
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join("");
    return `${prefix}${str}`;
  }
}

const App = () => {
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [state, setState] = useState('Connection...');
  const mediaRecorderRef = useRef(null);
  const websocketRef = useRef();
  const router = useRouter();
  const streamRef = useRef(null);
  const [volume, setVolume] = useState(0);
  const searchParams = useSearchParams();
  const botname = searchParams.get('name');
  const audioRef = useRef(null)
  const timeoutRef = useRef();
  const wavStreamPlayerRef = new useRef(new WavStreamPlayer({ sampleRate: 16000 }));
  const noiseProcessor = useRef(null);

  useEffect(() => {
    async function loadNoiseSuppressor() {
      const module = await import("@videosdk.live/videosdk-media-processor-web");
      noiseProcessor.current = new module.VideoSDKNoiseSuppressor();
    }

    loadNoiseSuppressor();
  }, []);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        if (isMuted) {
          audioTrack.enabled = true;
          setIsMuted(false);
        } else {
          audioTrack.enabled = false;
          setIsMuted(true);
        }
      }
    }
  }, [isMuted])

  const endCall = useCallback(() => {
    websocketRef.current?.close();
    wavStreamPlayerRef.current.interrupt();
    router.push('/');
  }, []);


  const onConnect = useCallback(() => {
    console.log('connected')
    const data = {
      event: 'start',
      start: {
        user: {
          name: "Manan Rajpout",
        },
        streamSid: nanoid()
      }
    }
    websocketRef.current.send(JSON.stringify(data));
    setTimeout(() => sendStream(), 4000);
  }, []);



  useEffect(() => {
    if (websocketRef.current) return;
    audioRef.current = new Audio();
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_MEDIA_SERVER_URL}/media-stream/web?isWebCall=false`);
    websocketRef.current = ws;
    wavStreamPlayerRef.current.connect().then(() => {});

    ws.onopen = onConnect;
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      switch (data.event) {
        case 'media':
          console.log('media coming...');
          const base64Audio = data.media.payload;
          const audio = Utils.base64ToArrayBuffer(base64Audio);
          const id = nanoid();
          wavStreamPlayerRef.current.add16BitPCM(audio, id);
          break;
        case 'clear':
          wavStreamPlayerRef.current.interrupt();
          break;
        case 'state':
          const value = data.state.value;
          if (value == "Thinking...") {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }
          setState(value);
          break;
      }
    };

    ws.onclose = () => {
      console.log('close');
    }

    // return () => {
    //   ws.close();
    // };
  }, []);

  const sendStream = async () => {
    console.log('start voice called')
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Your browser does not support audio recording.');
      return;
    }

    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 8000,
      }
    });

    const processedStream = await noiseProcessor.current.getNoiseSuppressedAudioStream(
      streamRef.current
    );

    mediaRecorderRef.current = new MediaRecorder(processedStream);
    mediaRecorderRef.current.ondataavailable = async (event) => {

      if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        const blob = event.data;
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.readyState == 2) {
            const data = {
              event: 'media',
              media: {
                payload: reader?.result?.split('base64,')[1]
              }
            }
            websocketRef.current.send(JSON.stringify(data));
          }
        }
        reader.readAsDataURL(blob);
      }
    };

    mediaRecorderRef.current.start(100);
  };


  return (
    <>
      <div className="flex flex-col h-screen bg-gradient-to-br from-indigo-100 to-purple-100">

        {/* Main Content */}
        <main className="flex-1 container mx-auto p-4 flex flex-col items-center justify-center">
          {/* AI Assistant and Audio Visualizer */}
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center justify-center space-y-6 w-full max-w-2xl">
            <div className={`relative w-48 h-48 ${isAISpeaking ? 'animate-pulse' : ''}`}>
              <div className="absolute inset-0 bg-indigo-300 rounded-full opacity-50"></div>
              <div className="absolute inset-2 bg-indigo-100 rounded-full flex items-center justify-center">
                <img
                  src="/images.jpg"
                  alt="AI Assistant"
                  className="w-32 h-32 rounded-full"
                />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-indigo-700">{botname || "Genagents"}</h2>
            <h2 className="text-xl font-normal text-red-600">{state}</h2>
            {/* Audio Visualizer */}
            <div className="w-full h-24 bg-gray-100 rounded-lg overflow-hidden grid place-items-center">

              <SoundWave isAnimating={isAISpeaking} />
            </div>
          </div>
        </main>

        {/* Control Bar */}
        <div className="bg-white shadow-lg p-4">
          <div className="container mx-auto flex justify-center items-center space-x-6">
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
                } hover:opacity-80 transition-opacity`}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <button
              onClick={endCall}
              className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <PhoneOff size={24} />
            </button>
            <button className="p-4 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">
              <MoreVertical size={24} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default App;
