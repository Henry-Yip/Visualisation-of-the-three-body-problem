// Orbits of the problem of two fixed centres, precomputed by
// src/computation/fixed_centres/generate.py.
export const FIXED_CENTRE_ORBITS: { [label: string]: string } = {
  Planetary: "fixed_planetary.txt",
  Lemniscate: "fixed_lemniscate.txt",
  Satellite: "fixed_satellite.txt",
};

// These orbits are larger than the three-body ones, so they are drawn smaller to fit the view.
export const FIXED_CENTRE_SCALE = 1 / 3;

export const isFixedCentreOrbit = (orbit: string) => orbit in FIXED_CENTRE_ORBITS;
