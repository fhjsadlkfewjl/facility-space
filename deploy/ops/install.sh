#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]]
install -d -m 700 /var/lib/facility-ops
install -m 700 "$(dirname "$0")/facility-ops.py" /usr/local/sbin/facility-ops
for action in backup verify monitor; do
  case "$action" in
    backup) calendar='*-*-* 00,06,12,18:30:00'; timeout=1800;;
    verify) calendar='Sun *-*-* 03:30:00'; timeout=1800;;
    monitor) calendar='*:0/5'; timeout=180;;
  esac
  cat > "/etc/systemd/system/facility-$action.service" <<EOF
[Unit]
Description=Facility Space $action
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/facility-ops $action
TimeoutStartSec=$timeout
UMask=0077
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF
  cat > "/etc/systemd/system/facility-$action.timer" <<EOF
[Unit]
Description=Schedule Facility Space $action
[Timer]
OnCalendar=$calendar
Persistent=true
RandomizedDelaySec=30
[Install]
WantedBy=timers.target
EOF
done
systemctl daemon-reload
systemctl enable --now facility-backup.timer facility-verify.timer facility-monitor.timer
