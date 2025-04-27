import { useEffect, useRef, useState, memo } from "react"
import vegaEmbed from "vega-embed"
import { useLiveAPIContext } from "../../contexts/LiveAPIContext"
import {  SchemaType } from "@google/generative-ai";

const declaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      json_graph: {
        type: SchemaType.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object"
      }
    },
    required: ["json_graph"]
  }
}

function AltairComponent() {
  const [jsonString, setJSONString] = useState("")
  const { client, setConfig } = useLiveAPIContext()

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
        }
      },
      systemInstruction: {
        parts: [
          {
            text:
              'You are my helpful assistant. Any time I ask you for a graph call the "render_altair" function I have provided you. Dont ask for additional information just make your best judgement.'
          }
        ]
      },
      tools: [
        // there is a free-tier quota for search
        { googleSearch: {} },
        { functionDeclarations: [declaration] }
      ]
    })
  }, [setConfig])

  useEffect(() => {
    const onToolCall = toolCall => {
      console.log(`got toolcall`, toolCall)
      const fc = toolCall.functionCalls.find(fc => fc.name === declaration.name)
      if (fc) {
        const str = fc.args.json_graph
        setJSONString(str)
      }
      // send data for the response of your tool call
      // in this case Im just saying it was successful
      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map(fc => ({
                response: { output: { sucess: true } },
                id: fc.id
              }))
            }),
          200
        )
      }
    }
    client.on("toolcall", onToolCall)
    return () => {
      client.off("toolcall", onToolCall)
    }
  }, [client])

  const embedRef = useRef(null)

  useEffect(() => {
    if (embedRef.current && jsonString) {
      vegaEmbed(embedRef.current, JSON.parse(jsonString))
    }
  }, [embedRef, jsonString])
  return <div className="vega-embed" ref={embedRef} />
}

export const Altair = memo(AltairComponent)
