import { defineEventHandler } from 'h3'
import { readEntitlements } from '../../utils/auth-session'

export default defineEventHandler(event => readEntitlements(event))
