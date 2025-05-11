'use client'
import axios from 'axios';
import React, { useCallback, useState } from 'react'

const page = () => {
    const [phone, setPhone] = useState('');
    const [loading,setLoading] = useState(false)
    const [prompt,setPrompt] = useState('');

    const callHandle = useCallback(async () => {
        setLoading(true)
        try {
            const res = await axios.post(`${process.env.NEXT_PUBLIC_MEDIA_SERVER_URL}/outbound`,{phone,prompt: prompt.trim()});
            window.alert(res.data.message)
        } catch (error) {
            window.alert(error?.response?.data?.message || error.message);
        }finally{
            setLoading(false)
        }
    },[phone,prompt])

    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-indigo-100 to-purple-100">

            {/* Main Content */}
            <main className="flex-1 container mx-auto p-4 flex flex-col items-center justify-center">
                {/* AI Assistant and Audio Visualizer */}
                <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center justify-center space-y-6 w-full max-w-2xl">
                    <input className='w-full bg-indigo-100 outline-none py-2 px-3 rounded-md placeholder:text-indigo-700' placeholder='+17676565758' value={phone} onChange={(e) => setPhone(e.target.value)}/>
                    <textarea className='w-full bg-indigo-100 outline-none py-2 px-3 rounded-md placeholder:text-indigo-700' placeholder='Enter your prompt' value={prompt} onChange={(e) => setPrompt(e.target.value)}/>
                    <button className='bg-indigo-700 text-white py-2 px-4 rounded-md' onClick={callHandle}>{loading ? 'Calling...': 'Call Now'}</button>
                </div>
            </main>

        </div>
    )
}

export default page