"""
Precomputes the three orbits of the problem of two fixed centres shown on the site, in the
same format as the three-body files in public/position_files.

    python src/computation/fixed_centres/generate.py

Two bodies of unit mass are held at (0, 1) and (0, -1). The third body has unit mass and moves
in the x-y plane under their gravity, with G = 1. The starting positions and velocities are
the planetary, lemniscate and satellite orbits of Yip and Smillie (2025), as listed in
https://github.com/Henry-Yip/Three_Body_Problem_Code.

Every 0.05 time units a frame is written: the change in Euler's second integral g since the
start ("dG"), the change in energy ("dEnergy"), and one line per body with its label,
position and velocity. Momentum is not written, because the fixed centres exert external
forces and momentum is not conserved.

Author: Henry Yip
"""
import math
import os
from concurrent.futures import ProcessPoolExecutor

OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "position_files")
DT = 1e-5
# One frame every 0.05 time units, five times the spacing of the three-body files: these
# orbits are slower, and at 0.01 one loop of the planetary orbit would take a minute to play.
STEPS_PER_FRAME = 5000
FRAMES = 3600

_CBRT2 = 2 ** (1 / 3)
_W = 2 - _CBRT2

# Folder name: (c coefficients, d coefficients). Each stage does v += c a(x) dt, then x += d v dt.
METHODS = {
    4: ([1 / (2 * _W), (1 - _CBRT2) / (2 * _W), (1 - _CBRT2) / (2 * _W), 1 / (2 * _W)],
        [1 / _W, -_CBRT2 / _W, 1 / _W, 0.0]),
    3: ([7 / 24, 3 / 4, -1 / 24], [2 / 3, -2 / 3, 1.0]),
    2: ([1 / 2, 1 / 2], [1.0, 0.0]),
    1: ([0.0, 1.0], [1.0, 0.0]),  # Euler: position first, then velocity
}

# File name: (starting position (x, y), starting velocity (vx, vy)).
ORBITS = {
    "fixed_planetary": ((1.8, 1.0), (2 / 3, -0.8)),
    "fixed_lemniscate": ((2.5, 1.5), (0.0, -0.4)),
    "fixed_satellite": ((2.5, 2.0), (0.0, 0.0)),
}


def acceleration(x, y):
    """Acceleration of the moving body due to the two centres."""
    to_upper = ((y - 1) ** 2 + x * x) ** -1.5
    to_lower = ((y + 1) ** 2 + x * x) ** -1.5
    return -x * (to_upper + to_lower), -(y - 1) * to_upper - (y + 1) * to_lower


def energy(x, y, vx, vy):
    return 0.5 * (vx * vx + vy * vy) - 1 / math.hypot(x, y - 1) - 1 / math.hypot(x, y + 1)


def euler_integral(x, y, vx, vy):
    """Euler's second integral g, with the centres on the y-axis."""
    return (0.5 * (y * vx - x * vy) ** 2 + 0.5 * vy * vy
            + y * (1 / math.hypot(x, y + 1) - 1 / math.hypot(x, y - 1)))


def write_frame(handle, d_g, d_energy, x, y, vx, vy):
    handle.write(f"dG = {d_g:g}\ndEnergy = {d_energy:g}\n")
    handle.write(f"0 {x:g} {y:g} 0 {vx:g} {vy:g} 0 \n")
    handle.write("1 0 1 0 0 0 0 \n2 0 -1 0 0 0 0 \n")


def run(job):
    method, name = job
    (x, y), (vx, vy) = ORBITS[name]
    c_list, d_list = METHODS[method]
    stages = list(zip(c_list, d_list))
    g0, e0 = euler_integral(x, y, vx, vy), energy(x, y, vx, vy)
    path = os.path.join(OUTPUT_FOLDER, str(method), f"{name}.txt")
    with open(path, "w") as handle:
        write_frame(handle, 0.0, 0.0, x, y, vx, vy)
        for _ in range(FRAMES - 1):
            for _ in range(STEPS_PER_FRAME):
                for c, d in stages:
                    if c:
                        ax, ay = acceleration(x, y)
                        vx += c * DT * ax
                        vy += c * DT * ay
                    if d:
                        x += d * DT * vx
                        y += d * DT * vy
            write_frame(handle, euler_integral(x, y, vx, vy) - g0, energy(x, y, vx, vy) - e0, x, y, vx, vy)
    return method, name, euler_integral(x, y, vx, vy) - g0, energy(x, y, vx, vy) - e0


def main():
    jobs = [(method, name) for method in METHODS for name in ORBITS]
    with ProcessPoolExecutor() as pool:
        for method, name, d_g, d_energy in pool.map(run, jobs):
            print(f"method {method}  {name:17} final change in g {d_g: .2e}, in energy {d_energy: .2e}")


if __name__ == "__main__":
    main()
