# Curriculum map and prerequisite routes

This is the user's local study library for **The Art of Problem Solving, Volume 1: The Basics** and **Volume 2: And Beyond**. It is not the separate AoPS Introduction/Intermediate textbook series. Chapters follow their original volumes; subject routes cross those boundaries. The proposed routes below are pedagogical recommendations, not a claim that the book prescribes this exact order.

## Whole-content map

| Direction | Foundation in Volume 1 | Further work in Volume 2 |
|---|---|---|
| Algebra | C01 exponents/logarithms; C02 complex arithmetic; C03 linear equations; C04 proportions; C06 quadratics; C07 factorization/manipulation; C08 number systems; C21 functions; C22 inequalities; C23 operations/relations; C24 sequences | C01 logarithms; C06 polynomials; C07 functional identities; C08 limits; C09 complex geometry/roots; C10 vectors/matrices; C11 cross products/determinants; C13 equations/expressions; C14 inequalities; C16 sequences; C18 periodicity/continued fractions |
| Number theory | C05 divisibility, bases, last digits, modular arithmetic, primes and common factors; C25.3 divisor counting; C28 proof methods | C23 congruences, divisor sums, Fermat, totient and Wilson; C24 linear Diophantine equations, triples, descent and Pell; connections to C06 integer polynomials and C18 continued fractions |
| Geometry and trigonometry | C09 circles; C10 angles; C11 triangles/trigonometry; C12 quadrilaterals; C13 polygons; C14 angle chasing; C15 area; C16 coordinates; C17 power of a point; C18 solids; C19 transformations; C20 mixed geometry | C02 trigonometric functions/identities; C03 triangle laws/centers; C04 cyclic quadrilaterals; C05 conics/polar coordinates; C12 analytic/vector geometry; C20 loci/construction; C21 collinearity/concurrency; C22 projections/inversion/homothety |
| Counting, probability and discrete mathematics | C25 counting, permutations, inclusion-exclusion and binomial theorem; C26 statistics/probability; C27 sets | C15 combinatorial identities; C17 correspondences, generating functions, partitions, graph counting and infinite sets; C19 probability; C25 graph theory |
| Proof and synthesis | C28 contradiction, converse/counterexamples, induction and pigeonhole; C29 mixed problems | C00 proof orientation; C26 mixed problems |

For complete chapter names, numbered section titles and page locators, use [catalog.md](catalog.md). The catalog includes 56 chapters. Topic overlap is intentional: vectors and trigonometry connect algebra to geometry; generating functions connect algebra to counting; continued fractions connect sequences to number theory.

## Shared proof foundation

Use V1-C28.1–28.3 to distinguish statements, proofs, converses and counterexamples. Add V1-C28.4 for induction when approaching sequences or divisibility proofs, and V1-C28.5 for pigeonhole arguments. V2-C00 is a short bridge to the second volume. Teach these tools alongside actual problems instead of requiring the entire proof chapter before any mathematics.

## Algebra route

1. **Arithmetic and symbolic fluency:** V1-C01 → V1-C03 → V1-C04. Check exponent laws, radicals, linear equations and ratio reasoning. V1-C08 clarifies rational/irrational numbers where needed.
2. **Structural algebra:** V1-C06 → V1-C07. Connect roots, factorization, quadratic formula, substitutions and symmetric manipulations. V1-C02 supplies basic complex arithmetic when roots require it.
3. **Functions and inequalities:** V1-C21 → V1-C22. Introduce V1-C23 when relations or unfamiliar operations are relevant. Use V1-C24 for sequences, geometric series and means.
4. **Polynomial depth:** V2-C06 → selected V2-C13. Build division/remainder methods, root-coefficient relations, transformations, Newton sums and stronger manipulations.
5. **Specialize by goal:** V2-C07 for functional equations; V2-C14 for AM-GM/Cauchy and optimization; V2-C16 for recurrence/summation techniques; V2-C01 for deeper logarithms.
6. **Later branches:** V2-C08 limits, V2-C09 complex geometry/roots, and V2-C10–11 linear algebra tools. Complex polar methods need trigonometry from V2-C02; coordinate/vector applications connect to V2-C12. These branches need not precede introductory number theory.

## Number-theory route

1. **Integers and factors:** V1-C05.1, 5.6 and 5.7. Establish divisibility, prime factorization, gcd/lcm and their proof use. V1-C25.3 connects prime exponents to divisor counts.
2. **Representations and residues:** V1-C05.2–5.5. Use bases, last digits and small residue examples to explain congruence notation and divisibility tests.
3. **Congruences systematically:** V2-C23.1–23.4. In particular, division in congruences has conditions; verify invertibility rather than cancelling as if every modulus were a field.
4. **Multiplicative tools:** V2-C23.5–23.8: divisor sums, Fermat's little theorem, the totient function and Wilson's theorem. Establish the hypotheses and learn when a simpler residue argument suffices.
5. **Integer equations:** V2-C24.1 for linear equations → 24.2 for primitive triples → 24.3 for infinite descent → 24.4–24.5 for Pell and general methods. Bring in algebraic factorization and parity/gcd facts as needed.
6. **Connections:** V2-C18.3–18.4 continued fractions, V2-C06 rational roots and integer polynomials, and sequence arguments in V2-C16. Choose these after the central divisibility/congruence route is secure.

## Other routes

- **Euclidean geometry:** V1-C10–15 plus C17 → V2-C03–04 → V2-C21–22. Bring in C09 and the needed triangle facts first. Add V1-C19 for transformations and V2-C20 for locus/construction.
- **Coordinate and vector geometry:** V1-C16 → V2-C05 or V2-C10–12, with trigonometry as needed. V1-C18 supports solids.
- **Counting and probability:** V1-C27 sets as needed → V1-C25 → V1-C26 → V2-C15 → V2-C17/19. V2-C25 is the graph-theory branch. Generating functions need polynomial/series fluency; introduce them after elementary counting methods.
- **Mixed problem solving:** use V1-C29 or V2-C26 after diagnosing the specific tools needed. Their chapter number alone does not establish a uniform problem difficulty.

## Retrieval granularity

Use a section for a focused concept; use a chapter for its development and surrounding examples; use the whole catalog for planning. For a cross-topic question, retrieve only the relevant sections from each branch. Section IDs are source numbering, and are unique only together with a volume ID. If no precise section locator is indexed, load the chapter or printed page.
