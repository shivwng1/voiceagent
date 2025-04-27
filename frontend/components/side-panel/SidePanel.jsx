
import cn from "classnames"
import { useEffect, useRef, useState } from "react"
import { RiSidebarFoldLine, RiSidebarUnfoldLine } from "react-icons/ri"
import Select from "react-select"
import { useLiveAPIContext } from "../../contexts/LiveAPIContext"
import { useLoggerStore } from "../../lib/store-logger"
import Logger from "../logger/Logger"
import "./side-panel.scss"

const filterOptions = [
  { value: "conversations", label: "Conversations" },
  { value: "tools", label: "Tool Use" },
  { value: "none", label: "All" }
]

export default function SidePanel() {
  const { connected, client } = useLiveAPIContext()
  const [open, setOpen] = useState(true)
  const loggerRef = useRef(null)
  const loggerLastHeightRef = useRef(-1)
  const { log, logs } = useLoggerStore()

  const [textInput, setTextInput] = useState("")
  const [selectedOption, setSelectedOption] = useState({ value: "conversations", label: "Conversations" })
  const inputRef = useRef(null)

  //scroll the log to the bottom when new logs come in
  useEffect(() => {
    if (loggerRef.current) {
      const el = loggerRef.current
      const scrollHeight = el.scrollHeight
      if (scrollHeight !== loggerLastHeightRef.current) {
        el.scrollTop = scrollHeight
        loggerLastHeightRef.current = scrollHeight
      }
    }
  }, [logs]);

  // listen for log events and store them
  useEffect(() => {
    client.on("log", log)
    return () => {
      client.off("log", log)
    }
  }, [client, log])

  const handleSubmit = () => {
    client.send([{ text: textInput }])

    setTextInput("")
    if (inputRef.current) {
      inputRef.current.innerText = ""
    }
  }

  return (
    <div className={`side-panel ${open ? "open" : ""}`}>
      <header className="flex justify-between text-2xl !py-3 px-4 border-b-[1px] border-gray-400">
        {open ? (
          <button className="opener" onClick={() => setOpen(false)}>
            <RiSidebarUnfoldLine color="#b4b8bb" />
          </button>
        ) : (
          <button className="opener" onClick={() => setOpen(true)}>
            <RiSidebarFoldLine color="#b4b8bb" />
          </button>
        )}
        <h2>CHAT</h2>
      </header>
      <div className="side-panel-container" ref={loggerRef}>
        <Logger filter={selectedOption?.value || "none"} />
      </div>
      <div className={cn("bg-neutral-900 py-2 px-4", { disabled: !connected })}>
        <div className="w-full flex items-center gap-4">
          <input
            className="flex-1 bg-transparent py-2 px-4 outline-none"
            placeholder="Write Something..."
            ref={inputRef}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                e.stopPropagation()
                handleSubmit()
              }
            }}
            onChange={e => setTextInput(e.target.value)}
            value={textInput}
          ></input>

          <button
            className="send-button material-symbols-outlined filled"
            onClick={handleSubmit}
          >
            send
          </button>
        </div>
      </div>
    </div>
  )
}
