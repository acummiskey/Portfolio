#!/usr/bin/env python3
"""Screen toggle button handler for the Simpsons TV.

Listens for a push button on GPIO 26 and toggles the Waveshare 2.8" DPI
display backlight on/off. Videos continue playing in the background when
the screen is off — just like a real TV.

GPIO 18: Backlight control (HIGH = on, LOW = off)
GPIO 19: Display clock alt function (a5 = on, input = off)
GPIO 26: Push button input (pulled up, active low)
"""

import signal
import subprocess
from gpiozero import Button, OutputDevice

BUTTON_PIN = 26
BACKLIGHT_PIN = 18
DISPLAY_PIN = 19

screen_on = True
backlight = OutputDevice(BACKLIGHT_PIN, initial_value=True)
button = Button(BUTTON_PIN, pull_up=True, bounce_time=0.3)


def set_display_pin(on):
    """Toggle GPIO 19 between alt function 5 (display on) and input (display off)."""
    if on:
        subprocess.run(["raspi-gpio", "set", str(DISPLAY_PIN), "op", "a5"],
                       check=False)
    else:
        subprocess.run(["raspi-gpio", "set", str(DISPLAY_PIN), "ip"],
                       check=False)


def toggle_screen():
    global screen_on
    screen_on = not screen_on
    if screen_on:
        set_display_pin(True)
        backlight.on()
    else:
        backlight.off()
        set_display_pin(False)


button.when_pressed = toggle_screen

signal.pause()
