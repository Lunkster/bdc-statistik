// Utgång-% och Checkout-% (v0.9.6, önskemål Henrik 2026-11-02)
//
// Utgång-% (exakt): andel rundor som började i ett utgångsläge (2–170, utom 159, 162, 163, 165, 166,
// 168, 169) och slutade med utgång.
// Checkout-% (vår uppskattning, per pil): utgångar / uppskattat antal pilar mot dubbel. Bara
// utgångsrundans pilar är kända; för övriga rundor gissas hur många av de tre som gick mot dubbel.
// n01 uppskattar med en egen modell, så siffrorna kan skilja några procentenheter.
const BOGEY = new Set([159, 162, 163, 165, 166, 168, 169]);
export const arDubbel = (r) => r === 50 || (r >= 2 && r <= 40 && r % 2 === 0);
export const utgangslage = (fore) => fore >= 2 && fore <= 170 && !BOGEY.has(fore);

// Uppskattade pilar mot dubbel i en runda: kvar före, kvar efter, pilar i rundan
export function pilarModDubbel(fore, efter, pilar) {
  if (!utgangslage(fore)) return 0;
  if (arDubbel(fore)) {
    if (efter === 0) return pilar;                       // utgång från dubbel: alla pilar
    if (efter === fore || arDubbel(efter)) return 3;     // missar eller delar dubbeln (32 → 16)
    return 2;                                            // singel som lämnar udda: oftast två mot dubbel
  }
  if (efter === 0) return pilar === 1 ? 1 : 1.5;         // utgång efter uppställning (t.ex. 55: S15, D20)
  if (fore <= 98 && (arDubbel(efter) || efter === fore)) return 1.5;   // uppställning som når en dubbel
  return 0;
}

// besok: [[fore, efter, pilar, antal], …] → { utgangar, pilar, procent }
export function checkoutUppskattad(besok) {
  let ut = 0, pil = 0;
  for (const [f, e, p, n = 1] of besok) {
    if (e === 0) ut += n;
    pil += n * pilarModDubbel(f, e, p);
  }
  return { utgangar: ut, pilar: pil, procent: pil ? (100 * ut) / pil : null };
}

// n01:s stats_list har besöken i "co": {"före,efter,pilar": antal}
export const besokUrN01 = (co) => Object.entries(co ?? {}).map(([k, n]) => [...k.split(',').map(Number), n]);
