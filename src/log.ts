/* eslint-disable no-console */
type Context = `- ${string}` | Event | Record<string, unknown>
type Message = `[${string}] ${string}`

export const error = (level: 'ERROR:', message: Message, context?: Context): false => {
  if (context === undefined) console.error(level, message)
  else console.error(level, message, context)
  return false
}
export const warn = (level: 'DEVWARN:' | 'WARN:', message: Message, context?: Context): false => {
  if (context === undefined) console.warn(level, message)
  else console.warn(level, message, context)
  return false
}
export const log = (message: Message, context?: Context): void => context === undefined ? console.log('LOG:', message) : console.log('LOG:', message, context)
