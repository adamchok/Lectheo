import type { ItemFx } from './types'

/** Hand-verified practice bank for Lecture 3. Segment idxs refer to lecture3 segments. */
export const lecture3Items: ItemFx[] = [
  // ---------- binary_search ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'binary_search',
    variant: 1,
    segs: [21, 22],
    stem: 'A program runs binary search for 42 on the unsorted array [3, 42, 7, 19, 8, 25, 11]. What can you conclude about the result?',
    options: {
      a: 'It may report that 42 is absent: comparing with the middle element can discard the half that actually holds 42',
      b: 'It will still find 42, just more slowly than on sorted input',
      c: 'It will find 42 because binary search eventually checks every element',
      d: 'It will crash, because binary search cannot run on unsorted data',
    },
    correct: 'a',
    explanation:
      'Binary search trusts that smaller values are left of the middle and larger ones right. Here the middle is 19; 42 > 19, so it searches [8, 25, 11], then [11], and reports "not found" even though 42 sits at index 1. Unsorted input gives wrong answers, not crashes.',
    distractors: {
      b: [
        'Sortedness only affects speed, not correctness',
        'The comparisons decide which half to throw away; on unsorted data the discarded half can contain the target, so the answer can be wrong.',
      ],
      c: [
        'Binary search visits every element eventually',
        'It looks at only about log₂ n elements; it never revisits the half it discarded.',
      ],
      d: [
        'Unsorted input causes a runtime error',
        'The code runs normally; it just follows the wrong half and returns an incorrect result.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'binary_search',
    variant: 2,
    segs: [22, 24],
    stem: 'Binary search runs on a sorted array of 1,000,000 numbers. At most about how many elements does it compare against the target?',
    options: {
      a: 'About 20',
      b: 'About 500,000',
      c: 'About 1,000',
      d: 'About 1,000,000',
    },
    correct: 'a',
    explanation:
      'Each comparison halves the remaining range: 1,000,000 → 500,000 → … → 1 takes about log₂ 1,000,000 ≈ 20 halvings, so about 20 comparisons.',
    distractors: {
      b: [
        'Halving the problem once means looking at half of the elements',
        'It halves repeatedly, not once; after 20 halvings only one candidate is left.',
      ],
      c: [
        'Divide-and-conquer costs about √n steps',
        'Repeated halving gives log₂ n, which grows far more slowly than √n.',
      ],
      d: [
        'In the worst case binary search is no better than linear search',
        'Its worst case is still about log₂ n comparisons; only linear search needs up to n.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'binary_search',
    variant: 1,
    segs: [21, 22, 23],
    sentences: [
      'Maya stores 1,000 student IDs in an array sorted from smallest to largest.',
      'To check whether ID 5150 is present, her function compares it with the ID in the middle of the array.',
      'If 5150 is smaller than the middle ID, the function continues in the right half of the array.',
      'Each step works on half as many IDs as the one before, so about 10 comparisons are enough for 1,000 IDs.',
      'When no IDs are left to check, the function returns false.',
    ],
    flaw: {
      idx: 2,
      summary:
        'It searches the wrong half: in an ascending array smaller values are in the left half.',
      correction:
        'If 5150 is smaller than the middle ID, continue in the left half; search the right half only when it is larger.',
    },
    explanation:
      'In an array sorted from smallest to largest, every ID left of the middle is smaller. A target smaller than the middle can only be in the left half. The other sentences are right: log₂ 1000 ≈ 10 and an empty range means "not found".',
    rubric: [
      'Fix names the left half',
      'States that a target smaller than the middle must be searched for in the left (smaller) half of an ascending array.',
    ],
    hints: [
      'Think about where the smaller values live in an array sorted in ascending order.',
      'Look closely at the step that decides which half to keep after comparing with the middle.',
    ],
    leak: ['left half', 'right half', 'wrong half', 'wrong direction'],
  },
  {
    kind: 'spot_flaw',
    concept: 'binary_search',
    variant: 2,
    segs: [21, 22, 24],
    sentences: [
      'A dictionary app keeps 64 words in alphabetical order in an array.',
      'To look up a word, it compares the word with the middle entry and keeps only the half that could still contain it.',
      'After at most 6 halvings a single candidate remains, so no lookup needs more than 7 comparisons.',
      'If the words were shuffled, the same procedure could miss a word that is actually present.',
    ],
    flaw: null,
    explanation:
      'Every sentence holds. 64 → 32 → 16 → 8 → 4 → 2 → 1 is 6 halvings, plus a final comparison with the last candidate gives at most 7. Binary search needs sorted input, so on shuffled words it can discard the half that holds the word.',
    rubric: [
      'Justifies the verdict',
      'Explains that 64 entries reach one candidate after 6 halvings and that binary search relies on sorted order.',
    ],
    hints: [
      'Count how many times you can halve 64 before one entry remains.',
      'Check each claim against the precondition binary search relies on.',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },

  // ---------- asymptotic_notation ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'asymptotic_notation',
    variant: 1,
    segs: [9, 17],
    stem: 'Bubble sort with the "stop if no swaps" check is in O(n²) and Ω(n). A classmate concludes "so bubble sort is in Θ(n²)". What is wrong with that claim?',
    options: {
      a: 'Nothing: Θ always describes the worst case',
      b: 'Θ applies only when the O and Ω bounds match; here they differ, so no single Θ describes bubble sort',
      c: 'It should be Θ(n), because Θ describes the best case',
      d: 'It should be Θ(n² − n), because Θ keeps the lower-order terms',
    },
    correct: 'b',
    explanation:
      'Θ(f) means the running time is bounded above and below by f. With early exit, sorted input takes about n steps while reversed input takes about n², so the bounds differ and no single Θ covers every input.',
    distractors: {
      a: [
        'Θ is just another name for the worst case',
        'Θ requires the upper and lower bounds to coincide; the worst case alone is what O describes here.',
      ],
      c: [
        'Θ describes the best case',
        'The best case is what Ω captures here; Θ needs both bounds to agree.',
      ],
      d: [
        'Θ is an exact step count that keeps every term',
        'Like O and Ω, Θ ignores constant factors and lower-order terms.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'asymptotic_notation',
    variant: 2,
    segs: [6, 7],
    stem: 'Algorithm A takes 1,000n steps and algorithm B takes n² steps on an input of size n. Which statement is true?',
    options: {
      a: 'A is in O(n) and B is in O(n²), so A wins for large enough n, even though B takes fewer steps for small n',
      b: 'A is slower for every n, because a constant like 1,000 dominates',
      c: 'They grow at the same rate, because both are polynomials in n',
      d: 'B is always faster, because n² has no constant factor',
    },
    correct: 'a',
    explanation:
      'Big O ignores constant factors because they stop mattering as n grows. B is faster only while n² < 1,000n, i.e. n < 1,000; beyond that A’s linear growth wins by an ever larger margin.',
    distractors: {
      b: [
        'Large constants dominate asymptotic behaviour',
        'For n > 1,000, n² exceeds 1,000n and the gap keeps growing; constants matter only for small n.',
      ],
      c: [
        'All polynomials are in the same big O class',
        'n and n² are different classes: doubling n doubles one and quadruples the other.',
      ],
      d: [
        'A missing coefficient makes an algorithm faster',
        'Once n > 1,000, n² is the larger step count no matter what the coefficients look like.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'asymptotic_notation',
    variant: 1,
    segs: [5, 6, 9],
    sentences: [
      'Selection sort makes (n − 1) + (n − 2) + … + 1 comparisons on a list of n numbers.',
      'That sum equals n(n − 1)/2, which is n²/2 − n/2.',
      'Dropping the lower-order term and the constant factor, selection sort is in O(n²).',
      'Because it never checks whether the list is already sorted, its best case also takes about n²/2 comparisons, so it is in Ω(n²).',
      'Its O and Ω bounds differ, so no Θ bound can be given for selection sort.',
    ],
    flaw: {
      idx: 4,
      summary: 'The O and Ω bounds are the same (n²), so a Θ bound does exist.',
      correction: 'Its O and Ω bounds are both n², so selection sort is in Θ(n²).',
    },
    explanation:
      'Sentences 1–4 are right. Since the upper bound O(n²) and lower bound Ω(n²) coincide, selection sort is in Θ(n²). It is bubble sort with early exit (O(n²), Ω(n)) that has no single Θ.',
    rubric: [
      'Correct Θ conclusion',
      'States that because O and Ω are both n², selection sort is in Θ(n²).',
    ],
    hints: [
      'Compare the upper bound and the lower bound the scenario derives.',
      'What does Θ require of the O and Ω bounds, and are they actually different here?',
    ],
    leak: ['Θ(n²)', 'theta of n squared', 'bounds are the same', 'bounds match'],
  },
  {
    kind: 'spot_flaw',
    concept: 'asymptotic_notation',
    variant: 2,
    segs: [13, 14, 6],
    sentences: [
      'A loop runs i from 0 to n − 1, and inside it another loop runs j from 0 to n − 1.',
      'The inner body compares two numbers and maybe swaps them, which takes a constant number of steps.',
      'So the total work is about n × n = n² constant-time steps.',
      'Big O keeps only the dominant term, so even 5n² + 3n is in O(n²).',
      'Therefore, if n doubles, the running time of this code roughly doubles too.',
    ],
    flaw: {
      idx: 4,
      summary: 'Quadratic work does not double when n doubles; it roughly quadruples.',
      correction: 'If n doubles, n² becomes (2n)² = 4n², so the running time roughly quadruples.',
    },
    explanation:
      'The analysis in sentences 1–4 is right: nested loops over n give about n² steps. For quadratic growth, doubling the input multiplies the work by four; only linear algorithms roughly double.',
    rubric: [
      'Correct growth factor',
      'States that doubling n roughly quadruples an n² running time, since (2n)² = 4n².',
    ],
    hints: [
      'Plug 2n into the step count the scenario derived.',
      'Which growth rate makes the work double when the input doubles, and is that the one derived here?',
    ],
    leak: ['quadruple', 'four times', '4n²', 'factor of 4'],
  },

  // ---------- selection_sort ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'selection_sort',
    variant: 1,
    segs: [8, 9],
    stem: 'You run selection sort on an array that is already sorted. How many comparisons does it make, compared with a randomly ordered array of the same size?',
    options: {
      a: 'About the same, roughly n²/2, because every pass still scans the rest of the array',
      b: 'Only about n, because it notices that nothing needs swapping and stops',
      c: 'Zero, because it detects sorted input before it starts',
      d: 'About half as many, because each minimum is found at the front of the scan',
    },
    correct: 'a',
    explanation:
      'To be sure an element is the smallest, selection sort must compare it against every remaining element, whether or not the array is sorted. That is (n − 1) + … + 1 = n(n − 1)/2 comparisons either way, hence Θ(n²).',
    distractors: {
      b: [
        'Selection sort stops early when no swaps are needed',
        'That early exit is bubble sort’s optimization; selection sort has no such check.',
      ],
      c: [
        'Sorting algorithms check for sorted input for free',
        'Checking sortedness itself takes a pass, and selection sort does not do it anyway.',
      ],
      d: [
        'Finding the minimum early means the scan can stop',
        'It cannot know it found the minimum until it has seen every remaining element.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'selection_sort',
    variant: 2,
    segs: [1, 2],
    stem: 'Selection sort (ascending) runs on [7, 2, 5, 4, 1, 6, 0, 3]. After exactly 3 passes, what is guaranteed?',
    options: {
      a: 'The first three positions hold 0, 1 and 2, already in their final places',
      b: 'The last three positions hold the three largest values',
      c: 'The whole array is sorted, because each pass fixes several elements',
      d: 'The first three positions are sorted among themselves, but smaller values may still be inserted before them later',
    },
    correct: 'a',
    explanation:
      'Pass i selects the smallest remaining element and swaps it into position i: [0, 2, 5, 4, 1, 6, 7, 3] → [0, 1, 5, 4, 2, 6, 7, 3] → [0, 1, 2, 4, 5, 6, 7, 3]. Those three values never move again.',
    distractors: {
      b: [
        'Selection sort fills the end with the largest values',
        'That is how bubble sort behaves; selection sort places the smallest values at the front.',
      ],
      c: [
        'Each pass sorts many elements at once',
        'Each pass places exactly one element; position 7 still holds 3 after three passes.',
      ],
      d: [
        'The front part is only locally sorted, as in insertion sort',
        'The selected elements are the global minimums, so nothing smaller remains to be placed before them.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'selection_sort',
    variant: 1,
    segs: [2, 5, 8, 9],
    sentences: [
      'Selection sort walks the unsorted part of the array and remembers the smallest value it has seen so far.',
      'At the end of the pass, it swaps that smallest value into the first unsorted position.',
      'The first pass makes n − 1 comparisons, the next n − 2, and so on down to 1.',
      'If the array is already sorted, selection sort notices that no swaps are needed and stops after one pass, so its best case is O(n).',
      'Its worst case, by contrast, is O(n²).',
    ],
    flaw: {
      idx: 3,
      summary:
        'Selection sort has no early exit; it still scans the rest of the array on every pass.',
      correction:
        'Selection sort never checks whether the array is sorted, so even sorted input takes about n²/2 comparisons: its best case is Ω(n²).',
    },
    explanation:
      'The "stop when a pass makes no swaps" trick belongs to bubble sort. Selection sort must compare every remaining element to confirm the minimum on every pass, so its best and worst cases are both on the order of n² (Θ(n²)).',
    rubric: [
      'Correct best case',
      'States that selection sort keeps scanning on every pass even for sorted input, so its best case is about n²/2 comparisons (Ω(n²)).',
    ],
    hints: [
      'Compare what each sentence claims with selection sort’s pseudocode, line by line.',
      'Does selection sort’s pseudocode contain any check that could end it early?',
    ],
    leak: ['no early exit', 'bubble sort', 'Ω(n²)', 'best case is n²'],
  },
  {
    kind: 'spot_flaw',
    concept: 'selection_sort',
    variant: 2,
    segs: [1, 2, 5],
    sentences: [
      "On [5, 3, 8, 1], selection sort's first pass finds 1 as the smallest value.",
      'It swaps 1 with 5, giving [1, 3, 8, 5].',
      'The second pass scans 3, 8 and 5, finds that 3 is smallest, and swaps it with 8, giving [1, 8, 3, 5].',
      'The third pass scans 8 and 5, finds 5, and swaps it with 8.',
      'Altogether it makes 3 + 2 + 1 = 6 comparisons, which matches n(n − 1)/2 for n = 4.',
    ],
    flaw: {
      idx: 2,
      summary: 'The minimum 3 is already in the first unsorted position, so it stays put.',
      correction:
        'The second pass swaps the minimum into position 1, where 3 already is, so the array stays [1, 3, 8, 5].',
    },
    explanation:
      'Selection sort swaps the minimum into the first unsorted position i, not with some later element. In pass 2, i = 1 already holds 3, so nothing changes. Pass 3 then swaps 5 and 8 to give [1, 3, 5, 8], and 3 + 2 + 1 = 6 = 4·3/2 comparisons is correct.',
    rubric: [
      'Correct second pass',
      'States that 3 is already at the first unsorted position, so pass 2 leaves the array as [1, 3, 8, 5].',
    ],
    hints: [
      'Trace the array after each pass on paper.',
      'Where does selection sort put the minimum it finds, and where is 3 already sitting?',
    ],
    leak: ['stays put', 'already in place', '[1, 3, 8, 5]', 'swaps with itself'],
  },

  // ---------- bubble_sort ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'bubble_sort',
    variant: 1,
    segs: [16, 17],
    stem: 'Bubble sort with the "stop if a pass made no swaps" check runs on [1, 2, 3, 4, 5, 6, 7, 8]. What happens?',
    options: {
      a: 'It makes one pass of 7 comparisons, sees no swaps, and stops',
      b: 'It still makes about n²/2 comparisons, because both loops always run to completion',
      c: 'It makes no comparisons, because it checks whether the array is sorted first, in O(1)',
      d: 'It makes 8 full passes, because the outer loop always repeats n times',
    },
    correct: 'a',
    explanation:
      'The single pass compares each neighbor pair (7 comparisons for 8 elements), makes no swaps, and the early exit ends the algorithm. That is why bubble sort with this check is in Ω(n).',
    distractors: {
      b: [
        'The loops always run in full',
        'True for selection sort and for bubble sort without the check; the early exit stops after the first swap-free pass.',
      ],
      c: [
        'Sortedness can be checked without looking at the elements',
        'Confirming that a list is sorted requires comparing each neighbor pair, which is the first pass itself.',
      ],
      d: [
        'The outer loop cannot end early',
        'The no-swaps check ends the outer loop as soon as a pass changes nothing.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'bubble_sort',
    variant: 2,
    segs: [11],
    stem: "Why does bubble sort's inner loop run i only up to n − 2 rather than n − 1?",
    options: {
      a: 'It compares numbers[i] with numbers[i + 1]; with i = n − 1 it would read past the end of the array',
      b: 'Because the last element is always in its final place before sorting begins',
      c: 'It is a speed optimization that lowers bubble sort’s big O',
      d: 'Because C arrays are indexed from 1 to n − 1',
    },
    correct: 'a',
    explanation:
      'The last valid index is n − 1. Comparing i with i + 1 for i = n − 1 would touch numbers[n], which is outside the array, so i stops at n − 2.',
    distractors: {
      b: [
        'The last element starts out in place',
        'Nothing is in place before sorting; the largest value only reaches the end after the first pass.',
      ],
      c: [
        'Shortening a loop by one changes the big O',
        'Saving one comparison per pass does not change the order of growth; the bound is about memory safety.',
      ],
      d: [
        'C arrays start at index 1',
        'C arrays start at 0, so an n-element array has indices 0 to n − 1.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'bubble_sort',
    variant: 1,
    segs: [10, 12, 16, 18],
    sentences: [
      'Bubble sort compares neighbors numbers[i] and numbers[i + 1] and swaps them if they are out of order.',
      'After the first full pass, the largest value is guaranteed to be in the last position.',
      'With the check "stop if a pass made no swaps", an already-sorted array needs only one pass of n − 1 comparisons.',
      'On a reversed array, however, it still needs on the order of n² comparisons.',
    ],
    flaw: null,
    explanation:
      'All four sentences are right. The largest value is carried along by every swap it is part of until it reaches the end; the early exit makes sorted input cost one pass (Ω(n)); and reversed input needs about n passes of about n comparisons (O(n²)).',
    rubric: [
      'Justifies the verdict',
      'Explains why the largest value reaches the end after one pass and why the early exit helps only sorted or nearly sorted input.',
    ],
    hints: [
      'Check each claim separately: one pass, the sorted case, the reversed case.',
      'Follow the largest value through one pass: can any comparison stop it from moving right?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },
  {
    kind: 'spot_flaw',
    concept: 'bubble_sort',
    variant: 2,
    segs: [11, 12, 14, 17],
    sentences: [
      "Bubble sort's inner loop runs i from 0 to n − 2, so it never compares past the end of the array.",
      'Each pass moves the smallest remaining value all the way to the front of the array.',
      'Because two nested loops each run about n times, its worst case is O(n²).',
      'Adding an early exit when a pass makes no swaps improves its best case to Ω(n).',
      'That early exit does not change its worst case, which remains O(n²).',
    ],
    flaw: {
      idx: 1,
      summary:
        'A pass carries the largest value to the end; small values move only one position left per pass.',
      correction:
        'Each pass bubbles the largest remaining value to the end of the array; the smallest value moves at most one position toward the front per pass.',
    },
    explanation:
      'In one left-to-right pass, the largest value wins every comparison it is in and is carried to the end. A small value can only be swapped one step left per pass. The other sentences are right.',
    rubric: [
      'Correct effect of a pass',
      'States that each pass moves the largest remaining value to the end, not the smallest to the front.',
    ],
    hints: [
      'Trace one pass on [3, 1, 4, 2] and watch where each value ends up.',
      'Which value wins every comparison during a left-to-right pass?',
    ],
    leak: ['largest', 'to the end', 'bubbles up', 'one position'],
  },

  // ---------- recursion ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'recursion',
    variant: 1,
    segs: [26, 27, 29],
    stem: 'draw(n) first calls draw(n − 1) and then prints a row of n hashes, but it has no base case. Suppose the compiler allowed it anyway: what happens when main calls draw(3)?',
    options: {
      a: 'It calls draw(2), draw(1), draw(0), draw(−1), … without ever printing a row, until it runs out of memory and crashes',
      b: 'It prints rows of 1, 2 and 3 hashes, then stops automatically at n = 0',
      c: 'It prints a row of 3, then 2, then 1 hashes, repeating forever',
      d: 'It loops forever printing rows but uses no extra memory, like an infinite while loop',
    },
    correct: 'a',
    explanation:
      'Every call recurses before printing anything, and nothing ever stops the chain, so no call returns and no row is printed. Each call uses more memory, so the program eventually crashes.',
    distractors: {
      b: [
        'Recursion stops on its own when n reaches 0',
        'Only an explicit base case such as "if (n <= 0) return;" stops it; without one n just keeps going negative.',
      ],
      c: [
        'The row is printed before the recursive call',
        'The recursive call comes first, so printing would only happen after calls return, and none ever do.',
      ],
      d: [
        'Recursion costs no memory, like a loop',
        'Each call needs its own memory, which is why deep recursion crashes where a loop would not.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'recursion',
    variant: 2,
    segs: [22, 23],
    stem: 'count(n) returns 0 if n == 0, and otherwise returns 1 + count(n − 2). For which starting values n ≥ 0 does count(n) terminate?',
    options: {
      a: 'Only even n: odd n skips over the base case 0 and keeps going negative',
      b: 'Every n ≥ 0, because n gets smaller with every call',
      c: 'No n, because a recursive function needs at least two base cases',
      d: 'Every n, because the compiler adds a base case at 0 automatically',
    },
    correct: 'a',
    explanation:
      'Recursive calls must shrink the problem toward a base case they actually reach. From odd n the sequence is n, n − 2, …, 1, −1, −3, …, which never equals 0.',
    distractors: {
      b: [
        'Shrinking the input is enough to guarantee termination',
        'The input must reach a base case; odd values step over 0 and continue forever.',
      ],
      c: [
        'Every recursive function needs two base cases',
        'One base case suffices if every call path reaches it; here even n does.',
      ],
      d: [
        'The compiler supplies base cases',
        'The compiler cannot invent stopping conditions; it at most warns when every path recurses.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'recursion',
    variant: 1,
    segs: [26, 27, 28, 29],
    sentences: [
      'A recursive draw(n) prints a pyramid of height n by first calling draw(n − 1).',
      'After that call returns, it prints one more row of n bricks.',
      'The base case "if (n <= 0) return;" stops the chain of calls once n reaches 0.',
      'Each call to draw gets its own copy of its local variables, such as the loop counter i.',
      'Because the calls all share the same memory, even a pyramid of height one million cannot run out of memory.',
    ],
    flaw: {
      idx: 4,
      summary:
        'Every recursive call uses additional memory, so very deep recursion can exhaust it.',
      correction:
        'Each call needs its own memory for its arguments and locals, so a pyramid of height one million makes a million nested calls and can run out of memory and crash.',
    },
    explanation:
      'Sentence 4 is the hint: every call has its own copy of its variables, which means memory per call. The lecture showed a huge height crashing the recursive version while the iterative one would not.',
    rubric: [
      'Memory per call',
      'States that each recursive call uses its own additional memory, so very deep recursion can run out of memory.',
    ],
    hints: [
      'Compare the last sentence with the one just before it.',
      'What did the lecture demo show when draw was given an enormous height?',
    ],
    leak: ['memory per call', 'stack overflow', 'crash', 'runs out of memory'],
  },
  {
    kind: 'spot_flaw',
    concept: 'recursion',
    variant: 2,
    segs: [21, 22, 23],
    sentences: [
      'In recursion, a base case is a condition that can be answered right away, without another call.',
      'A recursive case calls the same function on a smaller version of the problem.',
      'Binary search’s "search the left half" step is a recursive case, because it hands itself half as many doors.',
      'If a recursive case passed along a problem of the same size, the function would never reach its base case.',
    ],
    flaw: null,
    explanation:
      'All four sentences are right: base cases answer directly, recursive cases shrink the problem, binary search recurses on half the doors, and a call that does not shrink the problem never reaches a base case.',
    rubric: [
      'Justifies the verdict',
      'Explains the roles of the base case and the shrinking recursive case, using binary search as the example.',
    ],
    hints: [
      'Test each sentence against the definition of a base case and a recursive case.',
      'Does every recursive call in binary search really get a smaller problem?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },

  // ---------- merge_sort ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'merge_sort',
    variant: 1,
    segs: [38],
    stem: 'Merge sort, as shown in lecture, is given an array that is already sorted. What is its running time?',
    options: {
      a: 'Still Θ(n log n): it splits and merges exactly as usual, with no early exit',
      b: 'Θ(n), because merging two halves that are already in order is instant',
      c: 'Θ(n²), because sorted input is the worst case for divide-and-conquer sorts',
      d: 'Θ(log n), because it only needs to check the halves',
    },
    correct: 'a',
    explanation:
      'Merge sort always divides down to single elements and merges every level; each of the about log₂ n levels still costs about n steps. With no early exit its best case equals its worst case: Θ(n log n).',
    distractors: {
      b: [
        'Merge sort detects that its halves are in order and skips work',
        'The lecture’s merge sort has no early exit; every merge still walks through its elements.',
      ],
      c: [
        'Sorted input is the worst case for divide-and-conquer',
        'That is true of some quicksort variants, not merge sort, which always splits exactly in half.',
      ],
      d: [
        'Only the halving matters, not the merging',
        'Each level of merging touches all n elements, so the total is n per level times log n levels.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'merge_sort',
    variant: 2,
    segs: [33, 36, 37],
    stem: 'Why does merge sort take on the order of n log n steps for n = 1,024 elements?',
    options: {
      a: 'There are about log₂ 1024 = 10 levels of halving, and the merging on each level touches all 1,024 elements',
      b: 'Each element is compared with every other element, but only half of the time',
      c: 'It halves the array log n times and then does one n-step merge at the very end',
      d: 'Merging two halves of size n/2 takes log n steps, and that is done n times',
    },
    correct: 'a',
    explanation:
      'Splitting 1,024 elements down to single elements takes 10 levels. On each level, the merges together look at every element once (n steps), so the total is about n × log₂ n = 1,024 × 10 steps.',
    distractors: {
      b: [
        'Merge sort compares all pairs, like the quadratic sorts',
        'Comparing all pairs gives about n²/2, which is what selection sort does; merging never revisits elements.',
      ],
      c: [
        'Only the top-level merge costs real work',
        'Every level has merges, and each level’s merges together cost n steps.',
      ],
      d: [
        'A merge is a logarithmic operation',
        'Merging is linear: it walks both lists once, so merging n elements takes about n steps.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'merge_sort',
    variant: 1,
    segs: [30, 31, 32, 33, 37],
    sentences: [
      'Merge sort splits a list into a left half and a right half.',
      'It sorts each half by applying merge sort to it recursively.',
      'A list of one element is the base case, since it is already sorted.',
      'Merging two sorted halves of total size n takes about n² steps, because every element of one half is compared with every element of the other.',
      'With about log₂ n levels of merging, the total is O(n log n).',
    ],
    flaw: {
      idx: 3,
      summary: 'Merging is linear: compare the two front elements, take the smaller, advance.',
      correction:
        'Merging takes about n steps: repeatedly compare the two front elements, take the smaller and move that pointer forward, so each element is handled once.',
    },
    explanation:
      'Because both halves are sorted, the next smallest overall is always one of the two front elements, so a merge never compares all pairs. Linear merging is exactly what makes each level cost n and the total n log n.',
    rubric: [
      'Linear merge',
      'States that merging two sorted halves takes about n steps by repeatedly comparing the two front elements.',
    ],
    hints: [
      'Act out a merge of [1, 3, 4, 6] and [0, 2, 5, 7] with two fingers.',
      'When both halves are sorted, where can the next smallest element be?',
    ],
    leak: ['linear', 'n steps', 'front elements', 'two pointers'],
  },
  {
    kind: 'spot_flaw',
    concept: 'merge_sort',
    variant: 2,
    segs: [32, 33, 35, 38],
    sentences: [
      'To sort [6, 3, 4, 1], merge sort first sorts [6, 3] into [3, 6] and [4, 1] into [1, 4].',
      'To merge them, it compares 3 with 1 and takes 1, then compares 3 with 4 and takes 3.',
      'Next it compares 6 with 4 and takes 4, then takes the remaining 6, giving [1, 3, 4, 6].',
      'Unlike bubble sort with early exit, merge sort does the same Θ(n log n) work even when its input is already sorted.',
      'It typically needs extra memory about the size of the list to hold the merged results.',
    ],
    flaw: null,
    explanation:
      'Every step of the trace is right, merge sort has no early exit so sorted input still costs Θ(n log n), and merging needs an auxiliary array (the second shelf in lecture).',
    rubric: [
      'Justifies the verdict',
      'Confirms the merge trace step by step and explains the Θ(n log n) and extra-space claims.',
    ],
    hints: [
      'Redo the merge yourself and compare each step.',
      'Does merge sort have any check that could let it stop early?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },
]
