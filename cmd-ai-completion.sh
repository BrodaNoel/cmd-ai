# cmd-ai autocomplete

_ai_cli_completions_bash() {
  local cur prev opts
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  opts="config history man install-autocomplete --help -h --dry --explain --version"

  if [[ ${cur} == -* ]]; then
    COMPREPLY=( $(compgen -W "--dry --explain --help -h --version" -- ${cur}) )
    return 0
  fi

  COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
  return 0
}

_ai_cli_completions_zsh() {
  local -a opts flag_opts
  opts=(
    config
    history
    man
    install-autocomplete
    --help
    -h
    --dry
    --explain
    --version
  )
  flag_opts=(--dry --explain --help -h --version)

  if [[ "${words[CURRENT]}" == -* ]]; then
    compadd -- "${flag_opts[@]}"
    return 0
  fi

  compadd -- "${opts[@]}"
  return 0
}

if [[ -n "${BASH_VERSION:-}" ]]; then
  complete -F _ai_cli_completions_bash ai
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  autoload -Uz compinit 2>/dev/null
  if ! whence compdef >/dev/null 2>&1; then
    compinit -i >/dev/null 2>&1
  fi
  compdef _ai_cli_completions_zsh ai
fi
