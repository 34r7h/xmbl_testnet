# MAYO-C Multiplication Site Map

Source: PQCMayo/MAYO-C reference implementation, pinned at commit `4b7cd94`.
All file paths below are relative to `xid/mayo-c-source/`. This document is a
pure inventory of matrix/vector/scalar multiplication sites in the signing and
verification pipelines — no security claims or recommendations are made.

## Orientation: MAYO's oil-and-vinegar structure

MAYO signs with a multivariate quadratic public key `P: GF(16)^n -> GF(16)^m`.
The `n = v + o` input variables are split into `v` "vinegar" variables and `o`
"oil" variables (`o` is small; `v = n - o`). The public map is built from `m`
parallel quadratic forms, each represented as an `n x n` upper-triangular
matrix, and those `m` matrices are stored in three blocks depending on which
variable-block their coefficients multiply:

- **P1** — `m` upper-triangular `v x v` matrices (vinegar-vinegar coefficients).
- **P2** — `m` `v x o` matrices (vinegar-oil coefficients).
- **P3** — `m` upper-triangular `o x o` matrices (oil-oil coefficients).

Together `P = [[P1, P2], [0, P3]]` per equation. The private key holds a
random linear map `O` (a `v x o` matrix, "the oil space") and derives P3 so
that fixing any vinegar assignment and varying the oil part becomes *linear*
(the oil variables cancel out of the P1/P2/P3 quadratic structure). Key
generation computes `P3 = O^T (P1 O + P2)` so the public key can hide `O`.
Signing samples random vinegar values, evaluates the (now-linear-in-oil)
system, and solves an `m`-equation linear system over GF(16) for the `o`
oil unknowns (repeated `k` times / batched, hence the extra dimension `k`
used in the "whipping" construction that lets `m < n`). Verification simply
evaluates the full public quadratic map `P` on the received signature and
checks it matches the hashed target `t`. All arithmetic is over the field
`GF(16) = GF(2)[x]/(x^4+x+1)`, and `m`-many field elements (one per quadratic
form) are packed together into an `m_vec_limbs`-word bitsliced vector so a
single "vector multiply" instruction updates all `m` equations' coefficients
at once — this is why call sites below multiply a *scalar GF(16) element*
against an *m-vector* (`m_vec_mul_add` and friends) rather than looping over
`m` scalar multiplications explicitly.

Backends: the generic/portable C paths (`src/generic/*`, `src/arithmetic.c`,
`src/mayo.c`) are the primary target list below. `src/AVX2/shuffle_arithmetic.h`
and `src/neon/*` provide SIMD-vectorized equivalents of the *same* named
functions (`P1_times_O`, `P1_times_Vt`, `P1P1t_times_O`, `compute_M_and_VPV`,
`compute_P3`, `m_calculate_PS_SPS`, and an AVX2-specific `echelon_form_loop.h`
mirroring `EF()`) — they are noted once per function rather than re-documented
line-by-line, since they compute exactly the same quantities with the same
oil/vinegar block structure, using pre-expanded AVX2 multiplication tables
(`O_multabs`, `V_multabs`, `S1_multabs`) instead of the generic table-free code.

One file in the generic tree, `src/generic/ef_inner_loop.h`, is **not
`#include`d anywhere** in this source tree (confirmed via `grep -rn
ef_inner_loop`) — it is a textually-duplicated, orphaned copy of `EF()`'s
inner elimination loop (see the Verify/Sign echelon-solve entry below) and is
not a live call site in the generic-C, AVX2, or NEON builds.

---

## Key Generation

Call order: `mayo_keypair` → `mayo_keypair_compact` (`src/mayo.c:538-606`).

### 1. `P1_times_O` — P1 (vinegar-vinegar block) times O

- **File / function:** `src/generic/generic_arithmetic.h`, `P1_times_O` (lines 73-79), calling `mul_add_m_upper_triangular_mat_x_mat` (lines 15-28, multiply-accumulate at line 23).
- **Call site:** `src/generic/generic_arithmetic.h:267`, inside `compute_P3`, itself called from `src/mayo.c:588` (`compute_P3(p, P1, P2, O, P3)`).
- **Operand shapes:** `m` upper-triangular `v x v` matrices (`P1`, one per equation, `PARAM_v(p)` = `v`) times a single `v x o` matrix `O` (`PARAM_o(p)` = `o`); GF(16) scalar-vector multiply-accumulate `m_vec_mul_add` is invoked once per `(row, col, k)` triple, `row,col` ranging over the upper triangle of `v x v` and `k` over `o` columns of `O`. Result accumulates into `P2` in place (`P2 += P1*O`).
- **MAYO structure:** Key generation — computing the intermediate term of `P3 = O^T(P1*O + P2)`.
- **Oil/vinegar touch:** Reads only the **P1 (vinegar-vinegar) block**; multiplies it against the full oil-space map `O` (`v x o`), producing a `v x o` (vinegar-row, oil-column) intermediate — i.e., this is the vinegar-vinegar-block-times-oil-map product.

### 2. `mul_add_mat_trans_x_m_mat` — O^T times (P1*O + P2)

- **File / function:** `src/generic/generic_arithmetic.h`, `mul_add_mat_trans_x_m_mat` (lines 46-57, multiply-accumulate at line 53).
- **Call site:** `src/generic/generic_arithmetic.h:270`, inside `compute_P3`, called from `src/mayo.c:588`.
- **Operand shapes:** transpose of `O` (`o x v`, `PARAM_o(p)` x `PARAM_v(p)`) times `m` matrices `P2` (each `v x o`, now holding `P1*O + P2` after step 1) → accumulates into `P3` (`m` matrices, each `o x o`).
- **MAYO structure:** Key generation — final step computing `P3 = O^T * (P1*O + P2)`, the oil-oil block of the public key that must be derived (not random) to preserve the oil-vinegar trapdoor.
- **Oil/vinegar touch:** Full oil-space map `O^T` (oil x vinegar) times the vinegar-row/oil-column intermediate from step 1 — produces the **oil-oil (P3) block only**.

### 3. `m_upper` (not a multiplication — noted for completeness)

- **File / function:** `src/arithmetic.c:14-30`.
- **Call site:** `src/mayo.c:596`.
- Symmetrizes/folds `P3` into upper-triangular packed form via `m_vec_copy`/`m_vec_add` only — no GF(16) multiplication occurs here. Included only so a reviewer scanning for "every site touching P3" isn't left wondering why it's absent from the multiplication list.

**SIMD equivalents:** `src/AVX2/shuffle_arithmetic.h:180` (`P1_times_O`), `:389` (`compute_P3`, calling `P1_times_O` at `:393`) mirror steps 1-2 using precomputed `O_multabs` tables in place of `m_vec_mul_add`.

---

## Sign

Call order inside `mayo_sign_signature` (`src/mayo.c:359-500`):
`mayo_expand_sk` → hash/salt/`t` setup → per-attempt loop: decode vinegar `V` →
`compute_M_and_VPV` → `compute_rhs` → `compute_A` → `sample_solution`
(which internally runs `EF`) → final oil-to-vinegar remap via `mat_mul`.

### 4. `P1P1t_times_O` — (P1 + P1^T) times O (secret-key expansion)

- **File / function:** `src/generic/generic_arithmetic.h:217-240`; multiply-accumulate at lines 234-235 (`m_vec_mul_add`, called twice per off-diagonal entry to accumulate both the `(r,c)` and symmetric `(c,r)` contributions).
- **Call site:** `src/mayo.c:347`, inside `mayo_expand_sk` (`src/mayo.c:310-357`), which `mayo_sign_signature` calls at `src/mayo.c:392` at the start of every signing operation (also reachable via the public `mayo_expand_sk` API).
- **Operand shapes:** `m` matrices `P1` (each `v x v`, upper-triangular, only off-diagonal entries used since diagonal contributes to `P1+P1^T=0` on the diagonal over GF(2^k)-char-2 addition) times `O` (`v x o`) → accumulates into `L` (`m` matrices, `v x o`), aliased into `P2`'s storage (`L = P2` pointer, `src/mayo.c:346`).
- **MAYO structure:** Key expansion for signing — precomputes `L = (P1 + P1^T) O + P2`, the linear coefficient matrices used later to build each equation's linear part in the oil variables during central-map evaluation on chosen vinegar values.
- **Oil/vinegar touch:** **Vinegar-vinegar block (P1)** multiplied against the full oil map `O`; result lives in vinegar-row/oil-column space, i.e. this is strictly a P1-block-times-O computation (no P3/oil-oil involvement — oil-oil coefficients are handled separately since they don't depend on the vinegar assignment).

**SIMD equivalent:** `src/AVX2/shuffle_arithmetic.h:213`.

### 5. `mul_add_mat_x_m_mat` (as `VL = V * L`) — vinegar values times the per-equation linear map

- **File / function:** `src/generic/generic_arithmetic.h:60-71` (multiply-accumulate at line 67), invoked from `compute_M_and_VPV` at line 251.
- **Call site:** `src/generic/generic_arithmetic.h:251`, inside `compute_M_and_VPV` (lines 243-257), called from `src/mayo.c:456` (`compute_M_and_VPV(p, Vdec, L, P1, Mtmp, (uint64_t*) A)`).
- **Operand shapes:** decoded vinegar matrix `Vdec` (`k x v`, `PARAM_k(p)` rows each of `PARAM_v(p)` vinegar values) times `m` matrices `L` (each `v x o`, from step 4) → `VL` output (`m` matrices, each `k x o`), stored into `Mtmp`.
- **MAYO structure:** Central-map evaluation during signing — computing the "M_i" matrices, i.e. the linear-in-oil coefficients of each of the `k` whipped equations once the vinegar values are fixed. This is the linear part of `P(v_i + O*x)` restricted to the P1/P2-derived term.
- **Oil/vinegar touch:** Vinegar values (`v`-length rows of `Vdec`) times the P1-vinegar-derived linear map `L`; output indexed by oil columns (`o`) — vinegar-in, oil-coefficient-out.

### 6. `P1_times_Vt` — P1 times transpose of vinegar matrix

- **File / function:** `src/generic/generic_arithmetic.h:81-87`, wrapping `mul_add_m_upper_triangular_mat_x_mat_trans` (lines 31-43, multiply-accumulate at line 38).
- **Call site:** `src/generic/generic_arithmetic.h:255`, inside `compute_M_and_VPV`, called from `src/mayo.c:456`.
- **Operand shapes:** `m` upper-triangular `v x v` matrices `P1` times `V^T` (`v x k`, transpose of the `k x v` vinegar matrix) → `Pv` output (`m` matrices, each `v x k`).
- **MAYO structure:** Central-map evaluation — first half of computing the "VPV" quadratic vinegar-vinegar cross terms `v_i^T P1 v_j` needed for the constant term of each equation (the part of `y = P(v) - t` that must be canceled by the linear-in-oil solve).
- **Oil/vinegar touch:** **Vinegar-vinegar block (P1) only** — no oil variables enter this multiplication; it evaluates the quadratic form purely on vinegar values.

### 7. `mul_add_mat_x_m_mat` (as `VP1V = V * Pv`) — vinegar times (P1 * vinegar^T)

- **File / function:** `src/generic/generic_arithmetic.h:60-71` (multiply-accumulate at line 67), invoked a second time from `compute_M_and_VPV` at line 256.
- **Call site:** `src/generic/generic_arithmetic.h:256`, same call chain as items 5-6.
- **Operand shapes:** `Vdec` (`k x v`) times `Pv` (`m` matrices, each `v x k`, from step 6) → `VP1V` output (`m` matrices, each `k x k`).
- **MAYO structure:** Central-map evaluation — completes `v_i^T P1 v_j` for all `k x k` pairs of the whipped vinegar blocks; these values feed `compute_rhs` (item 8) to produce the target-side correction `y`.
- **Oil/vinegar touch:** **Vinegar-vinegar block only** (both operands derive from `Vdec`/`P1`); result is a `k x k` all-vinegar quadratic evaluation, entirely independent of `O`/oil variables.

### 8. `compute_rhs` — GF(16) polynomial-reduction scalar multiplications

- **File / function:** `src/mayo.c:43-109`; scalar GF(16) multiplications via `mul_f` at lines **77, 79, 84, 86** (folding a degree-`>k` "shift by X" term down using the characteristic-polynomial tail `f_tail`).
- **Call site (sign):** `src/mayo.c:458` (`compute_rhs(p, (uint64_t*) A, t, y)`, consuming the `VP1V` values produced in item 7, aliased through `A`'s storage).
- **Call site (verify):** `src/mayo.c:293`, inside `eval_public_map` — see Verify section, item 12.
- **Operand shapes:** scalar-by-scalar GF(16) multiplications (`mul_f(top, PARAM_f_tail(p)[jj])`, a nibble times a fixed reduction-polynomial coefficient), applied inside a loop that folds the `k x k` "VPV"/"SPS" array down to an `m`-length vector `y` (or `eval`) via repeated "multiply by X, reduce mod f(X)" steps (`PARAM_k(p)` iterations, `F_TAIL_LEN` inner reduction terms each).
- **MAYO structure:** Central-map inversion (sign) / public-map evaluation (verify) — this is the "whipping" reduction that combines the `k x k` grid of quadratic-form evaluations into the single `m`-vector right-hand-side `y = t XOR fold(VPV)` used by the linear solve, respectively the final evaluation `eval` compared against `t` in verify.
- **Oil/vinegar touch:** Operates on the already-summed `k x k` array (`VP1V` in sign — vinegar-only per item 7; `SPS` in verify — full P1+P2+P3 per item 11) — the reduction itself is oil/vinegar-agnostic scalar field arithmetic, not a matrix multiply over an oil or vinegar block.

### 9. `compute_A` — reduction-table scalar multiplications building the linear system matrix

- **File / function:** `src/mayo.c:154-260`. Multiplication sites: table construction via `mul_f` at lines **220-223** (building a 4-entry-per-tail-coefficient lookup table `tab[]`), and table application at line **239** (`t0*tab[4*t+0] ^ t1*tab[4*t+1] ^ t2*tab[4*t+2] ^ t3*tab[4*t+3]`, a bitsliced 4-way GF(16) multiply-by-constant applied across 64 nibbles at once via `uint64_t` multiplication).
- **Call site:** `src/mayo.c:459` (`compute_A(p, Mtmp, A)`), consuming the `VL` ("M_i") matrices produced in item 5.
- **Operand shapes:** input `VtL`/`Mtmp` is `PARAM_o(p)*PARAM_k(p)` m-vectors (the `k` stacked `o`-wide linear coefficient rows from item 5); output `A_out` is an `m x (k*o+1)` byte matrix (`PARAM_A_cols(p) = k*o+1`). The scalar reduction table is applied to fold the extra `(k+1)*k/2` "virtual" rows (needed because `k>1` extends the field via the same `f_tail` characteristic polynomial used in `compute_rhs`) back down onto the `m` base rows.
- **MAYO structure:** Central-map inversion setup — assembles the actual GF(16) linear system `A*x = y` (over the `k*o` oil unknowns across all `k` whipped copies) that `sample_solution`/`EF` will solve.
- **Oil/vinegar touch:** Columns of `A` are indexed by `(k, o)` — i.e. the linear system is exactly the oil-variable system produced after vinegar substitution; vinegar values no longer appear as free variables at this stage (they were consumed producing `VL`/`VP1V` upstream).

### 10. `sample_solution` — linear-solve multiplications

- **File / function:** `src/arithmetic.c:40-124`.
  - **Line 60:** `mat_mul(A, r, Ar, k*o+1, m, 1)` — `A` (`m x (k*o+1)`) times random vector `r` (`k*o+1`-length, last slot implicitly zero) → `Ar` (`m`-vector). Uses `mat_mul`/`lincomb` from `src/simple_arithmetic.h:78-85`/`69-76`.
  - **Line 108:** `mul_fx8(u, tmp)` inside the back-substitution loop (`src/arithmetic.c:88-121`) — a packed scalar-times-8-bytes GF(16) multiply (`src/simple_arithmetic.h:27-39`) used to eliminate a pivot column's contribution from all rows above it, 8 rows at a time.
  - **Called via `EF(A, m, k*o+1)` at `src/arithmetic.c:67`**, which performs Gaussian elimination (`src/generic/echelon_form.h:60-149`):
    - **Line 109:** `vec_mul_add_u64(row_len, _pivot_row, inverse, _pivot_row2)` (`src/arithmetic.h:93-105`) — scales the packed pivot row by the GF(16) inverse of the pivot element.
    - **Line 128:** `vec_mul_add_u64(row_len, _pivot_row2, below_pivot * elt_to_elim, packed_A + row * row_len)` — scales the normalized pivot row by each subsequent row's elimination coefficient and XORs it in.
- **Operand shapes:** `A` is `m x (k*o+1)` over GF(16); `r`/`x` are `k*o`-length oil-unknown vectors; `EF`'s pivot operations act on bitsliced rows of length `row_len = (k*o+1+15)/16` 64-bit words (16 nibbles/word).
- **MAYO structure:** Central-map inversion — the actual linear solve `A*x = y` for the oil unknowns `x`, using constant-time Gaussian elimination (`EF`) followed by back-substitution.
- **Oil/vinegar touch:** Entire computation is over the **oil-unknown system** (`k*o` columns) constructed in item 9; vinegar variables do not appear (already eliminated).

**Note on `src/generic/ef_inner_loop.h`:** contains an unreferenced, textually-duplicated copy of `EF()`'s per-pivot-column body (including its own `vec_mul_add_u64` calls at lines 33 and 52). It is not `#include`d by any generic, AVX2, or NEON source file in this tree, so it is documented here for completeness but is **not a live call site**.

### 11. `mat_mul` — final oil-to-vinegar signature remap

- **File / function:** `src/simple_arithmetic.h:78-85`, called at **`src/mayo.c:480`** (`mat_mul(sk.O, x + i * param_o, Ox, param_o, param_n - param_o, 1)`).
- **Operand shapes:** `sk.O` (`v x o`, `colrow_ab = o`, `row_a = n - o = v`) times the just-solved oil-part solution `x_i` (`o`-length, one of `k` blocks) → `Ox` (`v`-length). Repeated once per `i` in `0..k-1` inside the loop at `src/mayo.c:478-483`.
- **MAYO structure:** Final signature assembly — computing `s_i = v_i + O * x_i` (the `mat_add` immediately after, `src/mayo.c:481`, is the addition, not a multiplication), mapping the solved oil variables back into the vinegar coordinate space via the private linear map `O` before concatenating `x_i` itself as the oil coordinates.
- **Oil/vinegar touch:** The private oil-space map `O` (`v x o`) times the oil solution `x` — this is precisely the map that "hides" the oil subspace inside the public key; it produces the vinegar-coordinate half of the output signature block.

**SIMD equivalents for items 5-7:** `src/AVX2/shuffle_arithmetic.h:373` (`compute_M_and_VPV`, calling AVX2 `P1_times_Vt` at `:383` and reusing multab-based accumulate helpers analogous to `mul_add_mat_x_m_mat`).

---

## Verify

Call order inside `mayo_verify` (`src/mayo.c:617-674`): `mayo_expand_pk` (no
multiplication — just seed expansion and byte unpacking of stored `P1`,
`P2`, and already-summed `P3`) → `eval_public_map` (`src/mayo.c:288-294`).

### 12. `m_calculate_PS_SPS` — full public-map evaluation `S * P * S^T`

- **File / function:** `src/generic/generic_arithmetic.h:277-292`, called from `src/mayo.c:291` inside `eval_public_map`.
- Dispatches to one of two generic implementations depending on `HAVE_STACKEFFICIENT`/`PQM4`:
  - **Combined path — `mayo_generic_m_calculate_PS_SPS`** (`src/generic/generic_arithmetic.h:94-145`, selected at line 284): computes `P*S^T` and `S*(P*S^T)` in one pass. Multiplication mechanism: GF(16) scalar multiplications are performed via the **bin-accumulation trick** — each term is XOR-accumulated into one of 16 bins keyed by the nibble value of an `S` entry (`m_vec_add` calls at lines 112, 118, 125, 138), then **`m_vec_multiply_bins`** (called at lines **131** and **140**) performs the actual multiply by combining the 16 bins via a butterfly network of `m_vec_mul_add_x` / `m_vec_mul_add_x_inv` calls (multiply/divide-by-`X`) — see `src/generic/arithmetic_fixed.h:65-82` (fixed-params build) or `src/generic/arithmetic_dynamic.h:48-66` (dynamic-params build).
  - **Split path (default) — `mayo_generic_m_calculate_PS`** (lines 151-191, called at line 287) computes `P*S^T = [P1*S1+P2*S2; P3*S2]` using the same bin/`m_vec_multiply_bins` mechanism (bin-fill at lines 162, 169, 178; multiply at line **187**); then **`mayo_generic_m_calculate_SPS`** (lines 195-212, called at line 290) computes `S*(P*S^T)` the same way (bin-fill at line 201; multiply at line **209**).
- **Operand shapes:** `S` (i.e. the decoded signature, `k x n` over GF(16), `n = v+o`) multiplies the full public key `P = [[P1 (v x v), P2 (v x o)], [0, P3 (o x o)]]` (`m` matrices) on the right, then the result (`n x k`, `m`-vector entries) is multiplied by `S` again (`k x n`) on the left, producing `SPS` (`k x k`, `m`-vector entries).
- **MAYO structure:** Public-map evaluation — this is `P(s)` expanded as the bilinear/quadratic form `S*P*S^T` over the *entire* signature (both vinegar-derived and oil-derived coordinates of `s`), the verifier-side counterpart to the sign-side "M_i"/"VPV" computations (items 5-7) but here evaluated on the **full** `n`-dimensional `s`, not just vinegar values.
- **Oil/vinegar touch:** Unlike sign's `compute_M_and_VPV` (P1-block only, since oil values are unknown until solved), verify's evaluation touches **all three blocks — P1 (vinegar-vinegar), P2 (vinegar-oil), P3 (oil-oil)** — because at verify time the full signature `s` (concatenated vinegar and oil coordinates) is already known and the entire quadratic form must be evaluated to check `P(s) == t`.

### 13. `compute_rhs` — same reduction as item 8

- **File / function:** `src/mayo.c:43-109`, `mul_f` calls at lines 77, 79, 84, 86.
- **Call site:** `src/mayo.c:293`, inside `eval_public_map`, folding the `k x k` `SPS` array (from item 12, full P1/P2/P3 evaluation) down into the `m`-length `eval` output that is compared against `t` at `src/mayo.c:670`.
- **Oil/vinegar touch:** Operates on the full-block `SPS` result from item 12 (see item 8 for the reduction mechanism itself, which is block-agnostic).

**SIMD equivalent:** `src/AVX2/shuffle_arithmetic.h:401` (`m_calculate_PS_SPS`).

---

## Summary of site counts

| Stage | Distinct generic-C multiplication call sites |
|---|---|
| Key Generation | 2 (`P1_times_O`, `mul_add_mat_trans_x_m_mat` inside `compute_P3`) |
| Sign | 8 (`P1P1t_times_O`; `mul_add_mat_x_m_mat` x2 + `P1_times_Vt` inside `compute_M_and_VPV`; `compute_rhs`'s `mul_f` reduction; `compute_A`'s table build/apply; `sample_solution`'s `mat_mul` + `mul_fx8` + `EF`'s two `vec_mul_add_u64` sites; final `mat_mul` remap) |
| Verify | 2 (`m_calculate_PS_SPS`'s bin-multiply mechanism; `compute_rhs`'s `mul_f` reduction, shared code path with Sign) |

`compute_rhs` (item 8/13) and `EF`/`sample_solution`'s primitives are shared
code reused across Sign and Verify; they are counted once per stage above
because each stage reaches them via a distinct top-level call chain and with
different oil/vinegar provenance of the input data, per the notes above.
