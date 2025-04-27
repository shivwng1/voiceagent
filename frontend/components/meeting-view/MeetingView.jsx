import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import classNames from 'classnames'
import React, { forwardRef, useEffect, useState } from 'react'
import AudioPulse from '../audio-pulse/AudioPulse';

const MeetingView = forwardRef(({videoRef,videoStream},ref) => {
    const { client, connected, connect, disconnect, volume } = useLiveAPIContext();
    const [shareScreen, setShareScreen] = useState(true);
    
    useEffect(() => {
        connect();
        return () => {
            disconnect();
        }
    },[])
    return (
        <>
            <video
                className={classNames("stream", {
                    hidden: !videoRef.current || !videoStream
                })}
                ref={ref}
                autoPlay
                playsInline
            />

            {
                connected && !videoStream && !shareScreen &&
                <div className="action-button no-action outlined">
                    <AudioPulse volume={volume} active={connected} hover={false} />
                </div>
            }
            
                <iframe
                    src="http://localhost:6080/vnc.html?view_only=1&autoconnect=1&resize=scale"
                    allow="fullscreen"
                    className='w-[60vw] h-[100vh]'
                    hidden={!(shareScreen && connected)}
                ></iframe>
            
            

            {
                !connected && 
                <h2 className='text-3xl text-white'>Connecting...</h2>
            }
        </>
    )
})

export default MeetingView