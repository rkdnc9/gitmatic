// Side-effect imports register every git command with the dispatcher.
// Test files and the app import this module once to populate the command table.
import './init'
import './add'
import './commit'
import './status'
import './log'
import './diff'
import './restore'
import './show'
import './branch'
import './switch'
import './checkout'
