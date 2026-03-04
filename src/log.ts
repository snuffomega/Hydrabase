/* eslint-disable no-console */
type Context = `- ${string}` | Event | Record<string, unknown>
type Message = `[${string}] ${string}`

const time = () => (new Date()).toISOString()

export const error = (level: 'ERROR:', message: Message, context?: Context): false => {
  if (context === undefined) console.error(time(), level, message)
  else console.error(time(), level, message, context)
  return false
}
export const warn = (level: 'DEVWARN:' | 'WARN:', message: Message, context?: Context): false => {
  if (context === undefined) console.warn(time(), level, message)
  else console.warn(time(), level, message, context)
  return false
}
export const log = (message: Message, context?: Context): void => context === undefined ? console.log(time(), 'LOG:', message) : console.log(time(), 'LOG:', message, context)
