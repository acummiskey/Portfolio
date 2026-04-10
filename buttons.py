#!/usr/bin/env python3
"""Screen toggle button handler for the Retro TV.

Listens for a push button on GPIO 26 and toggles the Waveshare 2.8" DPI
display on/off. Videos continue playing in the background when the screen
is off — just like a real TV.

GPIO 18: PWM0 audio left channel / display backlight (shared pin)
GPIO 19: PWM1 audio right channel
GPIO 26: Push button input (pulled up, active low)

Screen on:  GPIO 18/19 in alt5 (PWM mode) — audio plays, backlight lit
Screen off: GPIO 18/19 set to output low — audio silenced, backlight off
"""

import signal
import subprocess
from gpiozero import Button

BUTTON_PIN = 26
screen_on = True
button = Button(BUTTON_PIN, pull_up=True, bounce_time=0.3)


def set_gpio_pwm(on):
    """Toggle GPIO 18/19 between alt5 (PWM audio) and output-low (off)."""
    if on:
        subprocess.run(["raspi-gpio", "set", "18", "a5"], check=False)
        subprocess.run(["raspi-gpio", "set", "19", "a5"], check=False)
    else:
        subprocess.run(["raspi-gpio", "set", "18", "op", "dl"], check=False)
        subprocess.run(["raspi-gpio", "set", "19", "op", "dl"], check=False)


def toggle_screen():
    global screen_on
    screen_on = not screen_on
    set_gpio_pwm(screen_on)


button.when_pressed = toggle_screen

signal.pause()
