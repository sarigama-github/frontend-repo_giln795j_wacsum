import { useEffect, useState } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'
import dayjs from 'dayjs'

const API = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') || ''

function Login({ onLoggedIn }) {
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    try {
      if (isRegister) {
        await axios.post(`${API}/auth/register`, { name, username, password }, { withCredentials: true })
      }
      const loginRes = await axios.post(`${API}/auth/login`, { username, password }, { withCredentials: true })
      const me = await axios.get(`${API}/auth/me`, { withCredentials: true })
      onLoggedIn({ user: me.data, token: loginRes.data?.token })
    } catch (e) {
      alert(e.response?.data?.detail || 'Auth error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-6">
      <div className="w-full max-w-md bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700">
        <h1 className="text-2xl font-bold mb-4">{isRegister ? 'Create account' : 'Welcome back'}</h1>
        <form className="space-y-4" onSubmit={submit}>
          {isRegister && (
            <div>
              <label className="text-sm">Name</label>
              <input className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-2" value={name} onChange={e=>setName(e.target.value)} required/>
            </div>
          )}
          <div>
            <label className="text-sm">Username</label>
            <input className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-2" value={username} onChange={e=>setUsername(e.target.value)} required/>
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input type="password" className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-2" value={password} onChange={e=>setPassword(e.target.value)} required/>
          </div>
          <button className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 font-semibold">{isRegister ? 'Sign up' : 'Login'}</button>
        </form>
        <button className="mt-4 text-sm text-blue-300" onClick={()=>setIsRegister(v=>!v)}>
          {isRegister ? 'Have an account? Login' : "Need an account? Sign up"}
        </button>
      </div>
    </div>
  )
}

function Chat() {
  const [me, setMe] = useState(null)
  const [socket, setSocket] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [typingMap, setTypingMap] = useState({})

  const loadMe = async () => {
    const res = await axios.get(`${API}/auth/me`, { withCredentials: true })
    setMe(res.data)
  }

  const loadConversations = async () => {
    const res = await axios.get(`${API}/conversations`, { withCredentials: true })
    setConversations(res.data)
  }

  const loadMessages = async (id) => {
    const res = await axios.get(`${API}/messages/${id}`, { withCredentials: true })
    setMessages(res.data)
  }

  const ensureSocket = async () => {
    // Rely on cookie-based auth. Server reads cookie in connect handler.
    const s = io(API, { transports: ['websocket'], withCredentials: true })
    s.on('connect', () => {})
    s.on('message:new', (msg) => {
      if (msg.conversationId === activeId) setMessages(m => [...m, msg])
      loadConversations()
    })
    s.on('typing', ({ conversationId, userId, isTyping }) => {
      if (conversationId !== activeId) return
      setTypingMap(m => ({ ...m, [userId]: isTyping }))
    })
    s.on('presence:online', () => {})
    s.on('presence:offline', () => {})
    setSocket(s)
    return s
  }

  useEffect(() => {
    ;(async () => {
      try {
        await loadMe()
        await loadConversations()
        await ensureSocket()
      } catch (e) {
        // not logged in
      }
    })()
  }, [])

  useEffect(() => {
    if (!socket || !activeId) return
    socket.emit('join', { conversationId: activeId })
  }, [socket, activeId])

  const onSend = async () => {
    if (!input.trim() || !activeId) return
    const res = await axios.post(`${API}/messages`, { conversationId: activeId, content: input }, { withCredentials: true })
    setInput('')
    setMessages(m => [...m, res.data])
  }

  const onSearch = async (q) => {
    setSearch(q)
    if (!q) return setSearchResults([])
    const res = await axios.get(`${API}/users/search?q=${encodeURIComponent(q)}`, { withCredentials: true })
    setSearchResults(res.data)
  }

  const startChat = async (userId) => {
    const res = await axios.post(`${API}/conversations`, { participantId: userId }, { withCredentials: true })
    const id = res.data.id
    await loadConversations()
    setActiveId(id)
    await loadMessages(id)
    setSearch('')
    setSearchResults([])
  }

  if (!me) return <Login onLoggedIn={async ({ user })=>{ setMe(user); await loadConversations(); await ensureSocket(); }} />

  return (
    <div className="h-screen grid grid-cols-[360px,1fr] bg-slate-900 text-slate-100">
      <div className="border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search or start new chat" className="w-full bg-slate-800 rounded-lg p-2 outline-none" />
        </div>
        {searchResults.length > 0 ? (
          <div className="overflow-y-auto">
            {searchResults.map(u => (
              <button key={u.id} onClick={()=>startChat(u.id)} className="w-full flex items-center gap-3 p-3 hover:bg-slate-800">
                <div className="w-10 h-10 rounded-full bg-slate-700" />
                <div className="text-left">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-slate-400">@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto">
            {conversations.map(c => (
              <button key={c.id} onClick={()=>{ setActiveId(c.id); loadMessages(c.id) }} className={`w-full flex items-center gap-3 p-3 hover:bg-slate-800 ${activeId===c.id?'bg-slate-800':''}`}>
                <div className="w-12 h-12 rounded-full bg-slate-700" />
                <div className="flex-1 text-left">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{c.isGroup ? (c.groupName || 'Group') : 'Chat'}</div>
                    <div className="text-xs text-slate-400">{c.updated_at ? dayjs(c.updated_at).format('HH:mm') : ''}</div>
                  </div>
                  <div className="text-sm text-slate-400 truncate">{c.lastMessage?.content || 'No messages yet'}</div>
                </div>
                {c.unread>0 && <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">{c.unread}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col">
        {!activeId ? (
          <div className="flex-1 grid place-items-center">Select or start a chat</div>
        ) : (
          <>
            <div className="p-3 border-b border-slate-800">Chat</div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map(m => (
                <div key={m.id} className={`max-w-[70%] rounded-2xl px-3 py-2 ${m.senderId===me.id? 'ml-auto bg-blue-600' : 'bg-slate-800'}`}>
                  {m.content}
                  <div className="mt-1 text-[10px] opacity-75 text-right">{dayjs(m.created_at).format('HH:mm')}</div>
                </div>
              ))}
              {Object.values(typingMap).some(Boolean) && (
                <div className="text-xs text-slate-400">Typing...</div>
              )}
            </div>
            <div className="p-3 border-t border-slate-800 flex items-center gap-2">
              <input value={input} onChange={e=>{ setInput(e.target.value); socket?.emit('typing', { conversationId: activeId, isTyping: true }) }} onBlur={()=>socket?.emit('typing', { conversationId: activeId, isTyping: false })} placeholder="Type a message" className="flex-1 bg-slate-800 rounded-full px-4 py-2 outline-none" />
              <button onClick={onSend} className="bg-blue-600 hover:bg-blue-500 rounded-full px-4 py-2 font-medium">Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Chat
