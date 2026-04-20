#!/usr/bin/env python3
"""Button + backlight handler for the Retro TV.

GPIO 18: Display backlight (output high = on, output low = off)
GPIO 19: PWM1 audio to amp (always alt5, never toggled)
GPIO 26: Push button — hold 3 seconds to reboot

Screen toggle is handled via SIGUSR1 from the web control panel.
"""

import signal
import subprocess
from gpiozero import Button, OutputDevice

BUTTON_PIN = 26
BACKLIGHT_PIN = 18
HOLD_TO_REBOOT_SECS = 3

screen_on = True
backlight = OutputDevice(BACKLIGHT_PIN, initial_value=True)
button = Button(BUTTON_PIN, pull_up=True, bounce_time=0.3,
                hold_time=HOLD_TO_REBOOT_SECS)


def toggle_screen():
    global screen_on
    screen_on = not screen_on
    if screen_on:
        backlight.on()
    else:
        backlight.off()


def reboot():
    subprocess.run(["systemctl", "reboot"])


button.when_held = reboot

# Allow the web control panel to toggle the screen via SIGUSR1
signal.signal(signal.SIGUSR1, lambda *_: toggle_screen())

while True:
    signal.pause()
