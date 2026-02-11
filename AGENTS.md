# Agent Runbook

## Dev server in tmux

Use a named tmux session so the game server keeps running and logs remain available.

```bash
cd /Users/yaroslavvolovich/projects/hex
npm install

tmux new-session -d -s hexworld-dev 'npm run dev -- --host 127.0.0.1 --port 5173 2>&1 | tee /tmp/hexworld-dev.log'
```

## Check server logs

```bash
tmux capture-pane -pt hexworld-dev -S -200
# or
tail -n 200 /tmp/hexworld-dev.log
```

## Attach / stop

```bash
tmux attach -t hexworld-dev
# detach with Ctrl+b then d

tmux kill-session -t hexworld-dev
```
