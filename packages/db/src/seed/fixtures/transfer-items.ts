import type { TransferFx } from './types'

/** Transfer problems (F4b, Should) for about half of the concepts. Segment idxs refer to the
 * concept's own lecture. */
export const transferItems: TransferFx[] = [
  // ---------- Lecture 3 ----------
  {
    kind: 'transfer',
    concept: 'binary_search',
    variant: 1,
    segs: [21, 22, 24],
    prompt:
      'A project has 1,024 commits in order. Commit 0 builds; commit 1,023 does not; and once a commit breaks the build, every later commit is broken too. Each build takes 5 minutes. Describe how to find the first broken commit with as few builds as possible, and how many builds you need at most.',
    modelSolution:
      'Use binary search over the commit history. Build the middle commit: if it is broken, the first broken commit is at or before it, so keep the left half; if it builds, the first broken commit is after it, so keep the right half. Repeat on the remaining range. Each build halves the range: 1,024 → 512 → … → 1, so at most log₂ 1024 = 10 builds (about 50 minutes) instead of up to 1,023 with a linear scan. It works because "broken" is monotonic along the history, which plays the role of sorted order.',
    explanation:
      'This is the idea behind git bisect: binary search applies to any ordered sequence where a single comparison tells you which half to discard.',
    rubric: [
      [
        'halving',
        'Halving strategy',
        'Tests the middle commit and keeps the half that must contain the first broken commit.',
      ],
      [
        'ordering',
        'Why halving is valid',
        'Explains that brokenness is monotonic (all later commits broken), which acts like sorted order.',
      ],
      [
        'bound',
        'Number of builds',
        'Gives about log₂ 1024 = 10 builds, versus up to about 1,000 for a linear scan.',
      ],
    ],
    hints: [
      'You have seen an algorithm that throws away half of the candidates after a single check.',
      'What does one build of the middle commit tell you about the commits before and after it?',
    ],
    leak: ['binary search', 'bisect', 'log', '10 builds'],
  },
  {
    kind: 'transfer',
    concept: 'bubble_sort',
    variant: 1,
    segs: [16, 17, 18, 8],
    prompt:
      'A game keeps a leaderboard of 10,000 scores sorted. Every minute a few scores change slightly, so each changed score ends up only a few positions away from where it belongs. Would you re-sort with bubble sort (with the early-exit check) or selection sort? Estimate the work for each and justify your choice.',
    modelSolution:
      'Bubble sort with early exit. Selection sort always makes n(n − 1)/2 ≈ 50 million comparisons on 10,000 scores, sorted or not, because it never checks for order. Bubble sort moves a misplaced value one position toward the front per pass (and any distance toward the back), so if every value is at most d positions from its place, about d + 1 passes suffice, and the final pass makes no swaps and triggers the early exit. With d of a few positions that is a few passes of about 10,000 comparisons each: tens of thousands instead of tens of millions.',
    explanation:
      'Bubble sort’s Ω(n) best case matters in practice when input is nearly sorted; selection sort is Θ(n²) regardless of input.',
    rubric: [
      [
        'choice',
        'Choice and reason',
        'Chooses bubble sort with early exit because the input is nearly sorted.',
      ],
      [
        'selection',
        'Selection sort cost',
        'Notes that selection sort still makes about n²/2 ≈ 50 million comparisons because it never checks for order.',
      ],
      [
        'passes',
        'Bubble sort cost',
        'Explains that only a few passes of about n comparisons are needed before a swap-free pass ends it.',
      ],
    ],
    hints: [
      'Think about what each algorithm does when the input is already sorted.',
      'How many passes does bubble sort need if no value is more than a few positions out of place?',
    ],
    leak: ['early exit', 'few passes', 'n²/2', 'nearly sorted'],
  },
  {
    kind: 'transfer',
    concept: 'merge_sort',
    variant: 1,
    segs: [32, 33, 39],
    prompt:
      'Two servers each write a log file already sorted by timestamp: one has 3 million lines, the other 5 million. You need one combined file sorted by timestamp. Describe your approach, give an upper bound on the number of timestamp comparisons, and explain why it beats appending the files and running selection sort.',
    modelSolution:
      'Use merge sort’s merge step. Keep a pointer at the front of each file, compare the two front timestamps, write the earlier line and advance that pointer; when one file runs out, copy the rest of the other. Every comparison outputs one line, so at most 3M + 5M − 1 ≈ 8 million comparisons: linear time. Appending and running selection sort would make about n²/2 = (8 × 10⁶)²/2 ≈ 3.2 × 10¹³ comparisons, because it ignores that both inputs are already sorted.',
    explanation:
      'Merging two sorted sequences is linear; it is the building block that gives merge sort its n log n bound.',
    rubric: [
      [
        'merge',
        'Uses a merge',
        'Walks both sorted files with two pointers, always taking the earlier timestamp.',
      ],
      ['bound', 'Linear bound', 'Bounds the work by about m + n ≈ 8 million comparisons.'],
      [
        'contrast',
        'Contrast with n²',
        'Explains that selection sort would need on the order of n² comparisons and wastes the existing order.',
      ],
    ],
    hints: [
      'Both inputs are already sorted. Which step of an algorithm from lecture takes advantage of that?',
      'Each comparison lets you write exactly one line to the output. How many lines are there?',
    ],
    leak: ['merge', 'two pointers', '8 million', 'm + n'],
  },
  // ---------- Lecture 4 ----------
  {
    kind: 'transfer',
    concept: 'memory_leaks',
    variant: 1,
    segs: [11, 12, 13, 18, 20],
    prompt:
      'A chat server handles each message by mallocing a 1 KB buffer, copying the message into it, broadcasting it, and returning, but it never frees the buffer. It handles 1,000 messages per second. What happens to the server over a day, how would you confirm the cause with a tool from lecture, and exactly where does the fix go?',
    modelSolution:
      'It leaks 1 KB per message: 1,000 KB per second, about 86 GB per day (1 KB × 1,000 × 86,400 s). Memory use climbs steadily, the machine slows down, and eventually malloc returns NULL (which, if unchecked, leads to a crash). Run it under Valgrind: the leak summary shows "definitely lost" bytes in many blocks, pointing at the malloc line in the message handler. Fix: call free(buffer) after the broadcast, once the buffer is no longer needed, on every path out of the handler; also check the malloc result for NULL.',
    explanation:
      'Leaks are harmless only for programs that exit quickly; servers must free every block they malloc.',
    rubric: [
      [
        'growth',
        'Effect over time',
        'Explains that memory use grows by about 1 MB per second (tens of GB per day) until the server slows or allocation fails.',
      ],
      [
        'valgrind',
        'Confirming the leak',
        'Uses Valgrind’s "definitely lost" report pointing at the malloc line.',
      ],
      [
        'fix',
        'Fix placement',
        'Frees the buffer after the broadcast, once it is no longer used, and checks malloc for NULL.',
      ],
    ],
    hints: [
      'Multiply the leak per message by messages per day.',
      'Which tool from lecture lists memory that was never freed, and where it was allocated?',
    ],
    leak: ['free(buffer)', 'definitely lost', '86 GB', 'valgrind'],
  },
  {
    kind: 'transfer',
    concept: 'pointers',
    variant: 1,
    segs: [23, 24, 27],
    prompt:
      'A game stores the player’s health in a heap-allocated int: int *health = malloc(sizeof(int));. The HUD and the damage system must both read and update the same health value. Explain how they can share it using pointers, what would go wrong if each system made its own copy of the value instead, and one pointer bug you would guard against.',
    modelSolution:
      'Give both systems the same address: pass or store the pointer health itself (copying the pointer, not the int). Both read with *health and update with *health -= damage, so they always see the one shared pointee. If each system mallocs its own int and copies the value, the copies diverge: damage would update one int while the HUD keeps showing the other. Guard against bugs such as using an uninitialized or NULL pointer (check malloc’s result, set the value before use), or using the pointer after it is freed; free it exactly once when the game ends.',
    explanation:
      'Sharing a pointee through copied addresses is the point of pointer assignment; copying values creates independent data.',
    rubric: [
      [
        'share',
        'Share the address',
        'Both systems hold the same pointer and access the value through *health.',
      ],
      [
        'copies',
        'Why copies diverge',
        'Explains that separate copies would get out of sync because updates go to only one of them.',
      ],
      [
        'bug',
        'A real pointer bug',
        'Names and guards against a genuine bug: NULL/uninitialized dereference, use after free, or double free.',
      ],
    ],
    hints: [
      'Recall what pointer assignment did for x and y in the Binky video.',
      'If two parts of a program each had their own int, which one would the damage system update?',
    ],
    leak: ['same address', 'shared pointee', '*health'],
  },
  {
    kind: 'transfer',
    concept: 'pass_by_reference',
    variant: 1,
    segs: [30, 35, 36, 38],
    prompt:
      'A C function must find the highest score in int scores[n] and also tell the caller the index where it occurs. A C function can return only one value. Design the function’s signature and body outline, and show how main calls it.',
    modelSolution:
      'Return the maximum and pass the index out by reference: int max_score(int scores[], int n, int *index). Inside, track best and best_i while looping; before returning, write *index = best_i; then return best. In main: int i; int best = max_score(scores, n, &i); after the call, i holds the index. Passing &i gives the function the address of main’s variable, so writing *index changes it; passing i by value would only change a copy.',
    explanation:
      'Out-parameters are pass by reference: the caller provides an address and the callee writes through it.',
    rubric: [
      [
        'signature',
        'Pointer parameter',
        'Adds an int * parameter (or similar) for the extra result.',
      ],
      [
        'caller',
        'Caller passes an address',
        'Calls the function with &i so it can write into main’s variable.',
      ],
      [
        'write',
        'Writes through the pointer',
        'Assigns via *index = … inside the function, explaining why a plain int parameter would not work.',
      ],
    ],
    hints: [
      'Think back to how swap was finally able to change main’s variables.',
      'What must main hand the function so it can write into one of main’s variables?',
    ],
    leak: ['int *index', '&i', '*index ='],
  },
  // ---------- Lecture 5 ----------
  {
    kind: 'transfer',
    concept: 'linked_lists',
    variant: 1,
    segs: [0, 2, 3, 4],
    prompt:
      'A music app keeps a playlist where users constantly insert songs right after the one currently playing, but almost never jump to "song number k". Would you store the playlist in an array or a linked list? Justify your choice using the cost of each operation.',
    modelSolution:
      'A linked list. The player already holds a pointer to the current node, so inserting after it is O(1): malloc a node, point it at current->next, and point current->next at it, with no copying. In an array, inserting in the middle means shifting every later song one slot (O(n)), and when the array is full, allocating a bigger one and copying everything (O(n)). The linked list’s weakness, O(n) access to song k, hardly matters because users rarely jump. A doubly linked list would also make "previous song" easy.',
    explanation:
      'Pick a data structure by its frequent operations: linked lists make local insertions cheap but give up random access.',
    rubric: [
      [
        'insert',
        'Cheap insertion',
        'Chooses a linked list and explains O(1) insertion after the current node by updating pointers.',
      ],
      [
        'array',
        'Array cost',
        'Explains that an array must shift later elements and sometimes reallocate and copy, O(n).',
      ],
      [
        'tradeoff',
        'Trade-off acknowledged',
        'Notes the linked list’s O(n) access to song k and why it is acceptable here.',
      ],
    ],
    hints: [
      'List the operations the app performs most often and what each costs in both structures.',
      'You already have a pointer to the song that is playing. What does inserting after it involve?',
    ],
    leak: ['O(1)', 'update pointers', 'shift', 'linked list'],
  },
  {
    kind: 'transfer',
    concept: 'hash_tables',
    variant: 1,
    segs: [27, 29, 30, 31, 32],
    prompt:
      'A spell checker must answer "is this word in the dictionary?" for 140,000 English words, millions of times per run. Design a hash table for it: the number of buckets, the hash function, how collisions are handled, and what a lookup costs. Then explain what would go wrong with only 26 buckets keyed on the first letter.',
    modelSolution:
      'Use on the order of 140,000 or more buckets (about one word per bucket on average) and a hash function that uses every letter of the word (for example, combining the letters arithmetically and taking the result modulo the bucket count) so words spread evenly. Handle collisions by chaining each bucket to a linked list. Expected chain length is then about 1, so a lookup costs hashing the word (proportional to its length) plus a short chain walk: effectively constant time on average, though O(n) in the worst case if many words collide. With 26 first-letter buckets, chains average about 5,400 words and are very uneven (many S words, few X words), so lookups are O(n/26) = O(n): thousands of string comparisons each.',
    explanation:
      'A hash table is fast only when the bucket count keeps up with the number of keys and the hash spreads them evenly; that is the trade-off between memory and chain length.',
    rubric: [
      [
        'buckets',
        'Bucket count',
        'Chooses a bucket count comparable to the number of words (load factor around 1).',
      ],
      ['hash', 'Hash function', 'Uses the whole word so keys spread evenly across buckets.'],
      [
        'cost',
        'Collisions and cost',
        'Uses chaining and states average near-constant lookups with an O(n) worst case.',
      ],
      [
        'critique',
        '26-bucket critique',
        'Explains that 26 buckets give long, uneven chains of thousands of words: O(n/26) = O(n).',
      ],
    ],
    hints: [
      'Think about how long each chain gets for a given number of buckets.',
      'What does a first-letter hash do with all the words that start with S?',
    ],
    leak: ['load factor', 'chaining', 'n/26', 'every letter'],
  },
  {
    kind: 'transfer',
    concept: 'tries',
    variant: 1,
    segs: [34, 35, 37, 38, 39],
    prompt:
      'A phone keyboard suggests completions as you type: after "pro" it should list stored words starting with "pro", from a vocabulary of 100,000 words. Explain how a trie supports this, how many steps it takes to reach the "pro" node, and one downside compared with storing the words in a hash table.',
    modelSolution:
      'Insert every word into a trie. To complete "pro", follow the P, R and O pointers from the root: 3 steps, regardless of the 100,000 words stored. Every word starting with "pro" lies in the subtree below that node, so traverse it and collect each node whose end-of-word flag is set (stopping after a few suggestions). A hash table hashes whole words, so it can answer "is pro a word?" but cannot find all words with a prefix without scanning every key. The downside of the trie is memory: each node holds 26 pointers, most of them NULL.',
    explanation:
      'Tries organize keys by their letters, which makes prefix queries natural; hash tables scatter keys by design.',
    rubric: [
      ['walk', 'Prefix walk', 'Follows P → R → O in 3 steps, independent of the number of words.'],
      [
        'collect',
        'Collect completions',
        'Traverses the subtree below the prefix node, collecting nodes marked as word ends.',
      ],
      [
        'tradeoff',
        'Comparison and downside',
        'Explains why a hash table cannot do prefix search efficiently and names the trie’s memory cost.',
      ],
    ],
    hints: [
      'Where in a trie do all words starting with "pro" live?',
      'Could a hash of the whole word help you find words that merely start with "pro"?',
    ],
    leak: ['subtree', 'P → R → O', '3 steps', 'end flag'],
  },
]
