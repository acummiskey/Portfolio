#!/usr/bin/env python3
"""Screen toggle button handler for the Retro TV.

Listens for a push button on GPIO 26 and toggles the Waveshare 2.8" DPI
display backlight on/off. Videos continue playing in the background when
the screen is off — just like a real TV.

GPIO 18: Display backlight (output high = on, output low = off)
GPIO 19: PWM1 audio to amp (always alt5, never toggled)
GPIO 26: Push button input (pulled up, active low)
"""

import signal
from gpiozero import Button, OutputDevice

BUTTON_PIN = 26
BACKLIGHT_PIN = 18

screen_on = True
backlight = OutputDevice(BACKLIGHT_PIN, initial_value=True)
button = Button(BUTTON_PIN, pull_up=True, bounce_time=0.3)


def toggle_screen():
    global screen_on
    screen_on = not screen_on
    if screen_on:
        backlight.on()
    else:
        backlight.off()


button.when_pressed = toggle_screen

signal.pause()
