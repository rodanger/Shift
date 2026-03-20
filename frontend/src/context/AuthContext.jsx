import { createContext, useContext, useState, useEffect } from 'react'
import client from '../api/client.jsx'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('sit_access')
    if (token) {
      client.get('/auth/profile/')
        .then(res => setCurrentUser(res.data))
        .catch(() => logout())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const { data } = await client.post('/auth/login/', { username, password }, {
      headers: { Authorization: undefined }
    })
    localStorage.setItem('sit_access',  data.access)
    localStorage.setItem('sit_refresh', data.refresh)
    const profile = await client.get('/auth/profile/')
    setCurrentUser(profile.data)
  }

  const logout = () => {
    localStorage.removeItem('sit_access')
    localStorage.removeItem('sit_refresh')
    setCurrentUser(null)
  }

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)