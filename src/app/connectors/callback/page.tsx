"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

export default function ConnectorsCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("Completing connection...")

  useEffect(() => {
    // Signal the opener window and close
    const timer = setTimeout(() => {
      setStatus("success")
      setMessage("Connected! You can close this window.")
      // Notify opener
      if (window.opener) {
        window.opener.postMessage({ type: "sparkie_oauth_complete" }, "*")
        setTimeout(() => window.close(), 1500)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0c0c14]">
      <div className="flex flex-col items-center gap-4 text-center px-6">
        {status === "loading" && (
          <Loader2 size={36} className="animate-spin text-honey-500" />
        )}
        {status === "success" && (
          <CheckCircle2 size={36} className="text-honey-500" />
        )}
        {status === "error" && (
          <XCircle size={36} className="text-red-400" />
        )}
        <p className="text-sm text-text-secondary">{message}</p>
        <p className="text-[11px] text-text-muted">This window will close automatically.</p>
      </div>
    </div>
  )
}
