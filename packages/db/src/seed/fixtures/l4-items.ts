import type { ItemFx } from './types'

/** Hand-verified practice bank for Lecture 4. Segment idxs refer to lecture4 segments. */
export const lecture4Items: ItemFx[] = [
  // ---------- strings_as_char_pointers ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'strings_as_char_pointers',
    variant: 1,
    segs: [0, 5],
    stem: 'char *s = get_string("s: "); char *t = s; t[0] = toupper(t[0]); The user typed "hi!". What do printf("%s\\n", s) and printf("%s\\n", t) print?',
    options: {
      a: 'Both print "Hi!": t = s copies the address, so s and t point at the same characters',
      b: 's prints "hi!" and t prints "Hi!", because t = s made a copy of the string',
      c: 'Both print "hi!", because toupper returns a new string and leaves memory unchanged',
      d: 'Nothing: the code does not compile, because C cannot assign one string to another',
    },
    correct: 'a',
    explanation:
      'A string variable is a char * holding the address of the first character. t = s copies that address, not the characters, so writing through t[0] changes the one shared copy of "hi!". A real copy needs malloc(strlen(s) + 1) and strcpy.',
    distractors: {
      b: [
        'Assigning a string copies its characters',
        's and t are pointers; assignment copies the address, so both refer to the same bytes.',
      ],
      c: [
        'toupper builds a new string',
        'toupper returns a single char, and assigning it to t[0] writes into the shared memory.',
      ],
      d: [
        'Pointer assignment is illegal in C',
        'Assigning one char * to another is valid; it just shares the memory instead of copying it.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'strings_as_char_pointers',
    variant: 2,
    segs: [0, 2, 3],
    stem: 'To copy s = "hi!" into newly allocated memory, how many bytes must you ask malloc for?',
    options: {
      a: "4: strlen(s) + 1, to make room for the '\\0' terminator",
      b: '3: strlen(s), the number of visible characters',
      c: '8: the size of a char * pointer',
      d: '1: malloc grows the block automatically as you copy into it',
    },
    correct: 'a',
    explanation:
      "C strings end with a '\\0' byte that strlen does not count. Without that extra byte the copy is not terminated, and functions like printf read past the end.",
    distractors: {
      b: [
        'strlen counts every byte a string occupies',
        "strlen stops before the terminator; the '\\0' needs one more byte.",
      ],
      c: [
        'You allocate the size of the pointer',
        'The pointer t already exists; malloc must provide room for the characters it will point to.',
      ],
      d: [
        'malloc’d memory grows as needed',
        'malloc returns a fixed-size block; writing past it is an invalid write.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'strings_as_char_pointers',
    variant: 1,
    segs: [0, 2, 3, 4, 5],
    sentences: [
      'In C, the type string from cs50.h is just a nickname for char *.',
      "So a string variable stores the address of the string's first character.",
      "The characters sit back to back in memory and end with the '\\0' null terminator.",
      'To copy s, the program mallocs strlen(s) bytes and copies characters with a loop from i = 0 while i < strlen(s).',
      'Afterward, changing t[0] leaves s unchanged, because t points to different memory.',
    ],
    flaw: {
      idx: 3,
      summary: 'The copy leaves no room for, and never copies, the terminating null character.',
      correction:
        "Allocate strlen(s) + 1 bytes and copy through i <= strlen(s) (or use strcpy) so the '\\0' terminator is copied too.",
    },
    explanation:
      'strlen returns the number of visible characters, 3 for "hi!". The copy needs a fourth byte for \'\\0\', and the loop must copy it; otherwise t is not a valid string.',
    rubric: [
      'Terminator handled',
      "States that the copy needs strlen(s) + 1 bytes and must also copy the '\\0' terminator.",
    ],
    hints: [
      'Think about every byte a C string occupies in memory, not just the letters.',
      'What does strlen count, and what does it leave out?',
    ],
    leak: ['+ 1', 'terminator', 'null character', "'\\0'", '<='],
  },
  {
    kind: 'spot_flaw',
    concept: 'strings_as_char_pointers',
    variant: 2,
    segs: [6, 7, 8],
    sentences: [
      "NUL, written '\\0', is a single byte of all zero bits that marks the end of a string.",
      'NULL is a special pointer value, address 0x0, where nothing is supposed to live.',
      'strcpy(t, s) copies the characters of s, including the terminator, into t.',
      'strcpy takes the source string first and the destination second.',
      'Before copying, t must already point to enough memory, such as malloc(strlen(s) + 1) bytes.',
    ],
    flaw: {
      idx: 3,
      summary: 'strcpy’s argument order is destination first, then source.',
      correction: 'strcpy takes the destination first and the source second, as in strcpy(t, s).',
    },
    explanation:
      'The lecture stressed that the order feels backwards but the destination comes first; sentence 3 itself shows strcpy(t, s) copying s into t. Swapping them would overwrite s with whatever is in t.',
    rubric: [
      'Argument order',
      'States that strcpy takes the destination first and the source second.',
    ],
    hints: [
      'Compare the claim about argument order with the example call earlier in the scenario.',
      'In strcpy(t, s), which string receives the characters?',
    ],
    leak: ['destination first', 'source second', 'argument order'],
  },

  // ---------- malloc_and_null ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'malloc_and_null',
    variant: 1,
    segs: [8, 10, 20],
    stem: 'int *x = malloc(3 * sizeof(int)); x[0] = 72; What is wrong with this code when the computer is almost out of memory?',
    options: {
      a: 'malloc may return NULL, and x[0] = 72 would then write to address 0x0; check x == NULL first',
      b: 'Nothing: malloc waits until memory frees up, so it always returns usable memory',
      c: 'malloc returns a block of 0 bytes, so the write to x[0] is silently ignored',
      d: 'The program crashes inside malloc itself, so checking afterward is pointless',
    },
    correct: 'a',
    explanation:
      'When malloc cannot provide the memory it returns NULL, the address 0x0 where nothing may live. Dereferencing it is invalid, so you test for NULL and bail out (e.g. return 1) before using x.',
    distractors: {
      b: [
        'malloc blocks until memory is available',
        'malloc returns immediately; on failure it reports NULL instead of waiting.',
      ],
      c: [
        'A failed malloc returns an empty but valid block',
        'It returns NULL, and writing through NULL is invalid, not ignored.',
      ],
      d: [
        'Allocation failure crashes inside malloc',
        'malloc signals failure by returning NULL; the crash comes later if you dereference it.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'malloc_and_null',
    variant: 2,
    segs: [14, 15],
    stem: 'Why write malloc(3 * sizeof(int)) instead of malloc(12)?',
    options: {
      a: 'sizeof(int) asks this system how big an int is; it is usually 4 bytes but not guaranteed, so the code stays portable',
      b: 'malloc counts in ints, so malloc(12) would allocate 12 ints',
      c: 'sizeof also reserves an extra byte for the NULL terminator',
      d: 'malloc(12) would allocate on the stack instead of the heap',
    },
    correct: 'a',
    explanation:
      'malloc takes a number of bytes. 3 * sizeof(int) is 12 on typical systems, but sizeof makes the request correct on any system where int has a different size.',
    distractors: {
      b: [
        'malloc’s argument counts elements',
        'malloc counts bytes; that is exactly why you multiply by sizeof(int).',
      ],
      c: [
        'sizeof adds room for a terminator',
        "sizeof(int) is just the size of one int; terminators are a string convention ('\\0'), and NULL is an address.",
      ],
      d: [
        'The argument decides stack versus heap',
        'malloc always allocates on the heap, whatever size you ask for.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'malloc_and_null',
    variant: 1,
    segs: [2, 8, 10],
    sentences: [
      'A program calls char *t = malloc(strlen(s) + 1); to make room for a copy of s.',
      'If the computer cannot provide that memory, malloc returns NULL, the address 0x0.',
      'So the program checks if (t == NULL) and returns 1 before using t.',
      'Only after that check does it copy s into t with strcpy(t, s).',
    ],
    flaw: null,
    explanation:
      'Every sentence is right: the + 1 makes room for the terminator, malloc signals failure with NULL, the check happens before any use of t, and strcpy takes the destination first.',
    rubric: [
      'Justifies the verdict',
      'Explains why the size, the NULL check and its placement before strcpy are all correct.',
    ],
    hints: [
      'Check the size, the failure value, and the order of operations.',
      'Is there any moment where t is used before it is known to be valid?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },
  {
    kind: 'spot_flaw',
    concept: 'malloc_and_null',
    variant: 2,
    segs: [14, 15, 16],
    sentences: [
      'int *x = malloc(3 * sizeof(int)); asks for room for three integers.',
      "On a typical system that's 12 bytes, since an int is usually 4 bytes.",
      'malloc returns the address of the first of those bytes, which is stored in x.',
      'The program then sets x[1] = 72, x[2] = 73 and x[3] = 33 to fill the three integers.',
      'When it is done with the numbers, it calls free(x).',
    ],
    flaw: {
      idx: 3,
      summary: 'The three ints are x[0] through x[2]; x[3] is past the end of the block.',
      correction: 'Fill x[0], x[1] and x[2]; x[3] writes 4 bytes past the 12 that were allocated.',
    },
    explanation:
      'Indexing starts at 0 for malloc’d blocks just as for arrays. Writing x[3] is the "invalid write of size 4" Valgrind reported in lecture.',
    rubric: [
      'Correct indices',
      'States that the three ints are x[0], x[1], x[2] and that x[3] is out of bounds.',
    ],
    hints: [
      'Count the slots in the allocated block and the indices actually written.',
      'Where does indexing start for a block of memory accessed with square brackets?',
    ],
    leak: ['x[0]', 'off by one', 'index 0', 'out of bounds'],
  },

  // ---------- memory_leaks ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'memory_leaks',
    variant: 1,
    segs: [18],
    stem: 'Valgrind reports "definitely lost: 12 bytes in 1 blocks" and points to the line int *x = malloc(3 * sizeof(int));. What does that mean?',
    options: {
      a: 'The 12 bytes allocated on that line were never freed before the program ended',
      b: 'malloc failed on that line and returned NULL',
      c: 'The program wrote 12 bytes past the end of the block',
      d: 'Those 12 bytes were freed twice',
    },
    correct: 'a',
    explanation:
      '"Definitely lost" is Valgrind’s leak report: memory that was allocated (here 3 ints × 4 bytes) and never freed. Valgrind names the allocation site so you know which free is missing.',
    distractors: {
      b: [
        '"Lost" means the allocation failed',
        'A failed malloc returns NULL; Valgrind’s leak summary is about memory that was allocated successfully but never freed.',
      ],
      c: [
        '"Lost" bytes are an overflow',
        'Writing out of bounds shows up as "invalid write"; this line is the leak summary.',
      ],
      d: [
        '"Lost" means double free',
        'Freeing twice is reported as an invalid free; lost means never freed at all.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'memory_leaks',
    variant: 2,
    segs: [11, 12],
    stem: 'Program A mallocs memory, never frees it, and exits after one second. A server runs the same code in a loop for weeks. Which is true?',
    options: {
      a: 'A gets away with it because memory is reclaimed when it exits, but the server keeps leaking more memory the longer it runs',
      b: 'Both are fine: C frees malloc’d memory automatically once no variable points to it',
      c: 'Both crash immediately, because a leak is a segmentation fault',
      d: 'Leaks only matter for strings from get_string, not for malloc',
    },
    correct: 'a',
    explanation:
      'C has no garbage collector. Leaked memory stays allocated until the process ends, so a long-running program’s usage grows and it slows down or eventually fails to allocate.',
    distractors: {
      b: [
        'C has automatic garbage collection',
        'Only free returns heap memory in C; unreferenced blocks stay allocated.',
      ],
      c: [
        'A leak crashes the program immediately',
        'A leak is silent; it just accumulates. Segfaults come from touching invalid memory.',
      ],
      d: [
        'Only get_string’s memory can leak',
        'CS50’s get_string frees its own memory; it is your own malloc calls that you must free.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'memory_leaks',
    variant: 1,
    segs: [11, 12, 13, 18],
    sentences: [
      'char *t = malloc(4); gives the program 4 bytes on the heap.',
      'When the program is done with t, it should call free(t) to hand the memory back.',
      'Forgetting to free is called a memory leak.',
      'A leak is harmless in long-running programs, because C frees memory automatically once no variable uses it.',
      'Valgrind can report leaked bytes and the line where they were allocated.',
    ],
    flaw: {
      idx: 3,
      summary: 'C has no automatic freeing; leaks accumulate in long-running programs.',
      correction:
        'C never frees heap memory for you; leaked memory stays allocated until the program exits, so long-running programs grow and slow down.',
    },
    explanation:
      'Only short programs get away with leaks, because everything is reclaimed when they exit. Long-running programs keep accumulating unreleased memory: the classic app that gets slower the longer it runs.',
    rubric: [
      'No garbage collection',
      'States that C does not free memory automatically, so leaks accumulate in long-running programs.',
    ],
    hints: [
      'Which kind of program did the lecture say suffers most from leaks?',
      'Who is responsible for returning malloc’d memory in C?',
    ],
    leak: ['garbage collector', 'no automatic', 'accumulate', 'grows'],
  },
  {
    kind: 'spot_flaw',
    concept: 'memory_leaks',
    variant: 2,
    segs: [17, 18, 21],
    sentences: [
      'Valgrind runs a program and checks how it uses memory.',
      '"Invalid write of size 4" means the program wrote an int’s worth of bytes somewhere it should not.',
      'With int *x = malloc(3 * sizeof(int));, writing to x[3] would cause that error.',
      '"Definitely lost: 12 bytes in 1 blocks" means 12 bytes were freed twice.',
      'After adding free(x), Valgrind reports that all heap blocks were freed.',
    ],
    flaw: {
      idx: 3,
      summary: '"Definitely lost" reports a leak: memory never freed.',
      correction: 'It means 12 bytes were allocated and never freed: a memory leak.',
    },
    explanation:
      'Sentence 5 gives it away: adding free(x) is what fixes "definitely lost". A double free would be reported as an invalid free instead.',
    rubric: [
      'Leak meaning',
      'States that "definitely lost" means memory was allocated and never freed.',
    ],
    hints: [
      'Look at what fixed the report at the end of the scenario.',
      'What would "lost" memory be, if not memory you can no longer free?',
    ],
    leak: ['never freed', 'leak', 'not freed'],
  },

  // ---------- pointers ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'pointers',
    variant: 1,
    segs: [23, 26, 27],
    stem: 'int *x = malloc(sizeof(int)); int *y = x; *x = 42; *y = 13; printf("%i\\n", *x); What is printed?',
    options: {
      a: '42, because only y’s value was changed',
      b: '13, because x and y hold the same address, so *y = 13 overwrites the single shared int',
      c: 'The address stored in x, because x is a pointer',
      d: 'Nothing: it crashes, because y never got its own malloc',
    },
    correct: 'b',
    explanation:
      'y = x copies the address, so both pointers share one pointee. *x = 42 stores 42 there, then *y = 13 overwrites the same int, so *x is 13. This is the Binky scene where both pointers "see the 13".',
    distractors: {
      a: [
        'y = x gives y its own copy of the int',
        'Pointer assignment copies only the address; there is still one int, which both pointers reach.',
      ],
      c: [
        'printf prints the pointer itself',
        '*x dereferences x, so printf receives the int stored at that address.',
      ],
      d: [
        'Every pointer needs its own malloc',
        'y points at valid memory because it was assigned x’s address; only an unassigned pointer would be bogus.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'pointers',
    variant: 2,
    segs: [22, 24, 25],
    stem: 'Inside a function: int *y; *y = 13; Here y was declared but never assigned. What happens?',
    options: {
      a: 'A pointee is created automatically and set to 13',
      b: '13 is written to whatever garbage address y holds: undefined behavior that may crash or corrupt memory',
      c: 'y is automatically NULL, so the write is safely ignored',
      d: 'The compiler reserves 4 bytes for y’s pointee when y is declared',
    },
    correct: 'b',
    explanation:
      'Declaring a pointer gives it no pointee; an uninitialized local pointer holds a garbage address. Dereferencing it writes to some arbitrary location: Binky’s "that didn’t work" moment.',
    distractors: {
      a: [
        'Dereferencing a pointer creates its pointee',
        'Setting up a pointee is a separate step (malloc or assigning an address).',
      ],
      c: [
        'Uninitialized pointers default to NULL, and NULL writes are ignored',
        'Local variables start with garbage values, and writing through NULL is invalid, not ignored.',
      ],
      d: [
        'Declaring a pointer allocates its pointee',
        'Declaring int *y reserves room only for the address, not for an int.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'pointers',
    variant: 1,
    segs: [23, 25, 26, 27],
    sentences: [
      'int *x; declares a pointer that will hold the address of an int.',
      'x = malloc(sizeof(int)); gives x a pointee: 4 bytes on the heap.',
      '*x = 42; follows the arrow and stores 42 in that pointee.',
      'int *y = x; makes a separate copy of the pointee, so y has its own int containing 42.',
      'Dereferencing a pointer that was never assigned, by contrast, would touch a garbage address.',
    ],
    flaw: {
      idx: 3,
      summary: 'Pointer assignment copies the address, not the pointee.',
      correction:
        'int *y = x; copies only the address, so y points at the same pointee as x; there is still exactly one int.',
    },
    explanation:
      'Binky’s "magic wand of pointer assignment" makes two pointers share one pointee. To get an independent int you would malloc a new one and copy the value: *y = *x.',
    rubric: [
      'Shared pointee',
      'States that y = x copies the address, so x and y share one pointee instead of each having an int.',
    ],
    hints: [
      'Draw boxes and arrows for x, y and every int that exists.',
      'What exactly gets copied when one pointer is assigned to another?',
    ],
    leak: ['same pointee', 'copies the address', 'shared', 'one int'],
  },
  {
    kind: 'spot_flaw',
    concept: 'pointers',
    variant: 2,
    segs: [19, 23, 26],
    sentences: [
      'In the declaration int *x, the star means x is a pointer to an int.',
      'In *x = 42;, with no type to its left, the star means dereference: go to the address in x.',
      'x[1] is equivalent to *(x + 1): the int right after the one x points to.',
      'Since an int is 4 bytes on such a system, x + 1 refers to the address 4 bytes past x.',
    ],
    flaw: null,
    explanation:
      'All four are right. The star declares a pointer or dereferences one depending on context, brackets are syntactic sugar for pointer arithmetic, and pointer arithmetic counts in units of the pointed-to type (sizeof(int) bytes per step).',
    rubric: [
      'Justifies the verdict',
      'Explains both meanings of the star and why x + 1 moves by sizeof(int) bytes.',
    ],
    hints: [
      'Check each use of the star in its context.',
      'When you add 1 to an int pointer, does it move by one byte or by one int?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },

  // ---------- pass_by_reference ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'pass_by_reference',
    variant: 1,
    segs: [28, 29, 30, 34],
    stem: 'void swap(int a, int b) { int tmp = a; a = b; b = tmp; } In main: int x = 1; int y = 2; swap(x, y); printf("%i %i\\n", x, y); What is printed?',
    options: {
      a: '2 1, because swap exchanged the two values',
      b: '1 2, because swap received copies of x and y and only swapped the copies',
      c: '2 2, because tmp is lost when swap returns',
      d: 'Nothing: it does not compile, because a function may not change its parameters',
    },
    correct: 'b',
    explanation:
      'C passes arguments by value: a and b are copies of x and y in swap’s own stack frame. Swapping them has no effect on main’s variables. To change x and y, swap needs their addresses.',
    distractors: {
      a: [
        'Parameters are aliases for the caller’s variables',
        'In C they are copies; only pointers let a function reach the caller’s variables.',
      ],
      c: [
        'Losing tmp corrupts one of the values',
        'tmp is only swap’s scratch space; x and y are never touched at all.',
      ],
      d: [
        'Parameters are read-only',
        'A function may assign to its parameters; it just changes its own copies.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'pass_by_reference',
    variant: 2,
    segs: [35, 36, 38],
    stem: 'Which version correctly swaps main’s x and y?',
    options: {
      a: 'void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; } called as swap(&x, &y)',
      b: 'void swap(int *a, int *b) { int *t = a; a = b; b = t; } called as swap(&x, &y)',
      c: 'void swap(int a, int b) { int t = a; a = b; b = t; } called as swap(&x, &y)',
      d: 'void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; } called as swap(x, y)',
    },
    correct: 'a',
    explanation:
      'The caller must pass addresses (&x, &y), and swap must dereference them (*a, *b) to read and write the original ints. Swapping the pointer variables themselves changes nothing outside swap.',
    distractors: {
      b: [
        'Swapping the pointers swaps the values they point to',
        'a and b are swap’s own copies of the addresses; exchanging them never writes to x or y.',
      ],
      c: [
        'Writing & at the call site is enough',
        'The parameters are still ints, so swap still works on copies (and the types do not even match).',
      ],
      d: [
        'The pointer signature alone is enough',
        'Passing x and y passes their values, not their addresses, so swap would dereference bogus addresses.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'pass_by_reference',
    variant: 1,
    segs: [28, 30, 33, 34],
    sentences: [
      'main sets int x = 1 and int y = 2, then calls swap(x, y).',
      'swap is declared as void swap(int a, int b), and the call gets its own frame on the stack.',
      'Inside swap, a and b are copies of x and y.',
      'swap uses a temporary variable to exchange a and b.',
      'When swap returns, x is 2 and y is 1 back in main.',
    ],
    flaw: {
      idx: 4,
      summary: 'Only the copies a and b were exchanged; main’s x and y are unchanged.',
      correction:
        'When swap returns, x is still 1 and y is still 2: swap exchanged only its copies a and b.',
    },
    explanation:
      'Sentences 1–4 describe pass by value correctly, which is exactly why the conclusion fails. Fixing it needs swap(int *a, int *b) called as swap(&x, &y).',
    rubric: [
      'Values unchanged',
      'States that x and y remain 1 and 2 because only the copies were swapped.',
    ],
    hints: [
      'Follow the actual variables x and y, not a and b.',
      'Which variables does the temporary-variable dance actually touch?',
    ],
    leak: ['still 1', 'unchanged', 'only the copies', 'pass by value'],
  },
  {
    kind: 'spot_flaw',
    concept: 'pass_by_reference',
    variant: 2,
    segs: [35, 36, 37, 38],
    sentences: [
      'To let swap change main’s variables, its parameters become int *a and int *b.',
      'main calls swap(&x, &y), passing the addresses of x and y.',
      'Inside swap, int tmp = *a; stores the value that a points to.',
      'Then a = b; and b = &tmp; finish the swap.',
      'After swap returns, x and y in main hold each other’s original values.',
    ],
    flaw: {
      idx: 3,
      summary: 'Reassigning the local pointers never writes to x or y; it must dereference.',
      correction:
        'Write through the pointers: *a = *b; *b = tmp; reassigning a and b only changes swap’s local copies of the addresses.',
    },
    explanation:
      'a and b are themselves local copies of addresses. Only dereferencing (*a = …, *b = …) reaches main’s ints; b = &tmp would even point at swap’s own frame, which vanishes on return.',
    rubric: [
      'Dereference to write',
      'States that swap must assign *a = *b and *b = tmp rather than reassigning the pointers.',
    ],
    hints: [
      'Mark which lines read or write main’s ints and which only touch swap’s locals.',
      'What is the difference between assigning to a and assigning to *a?',
    ],
    leak: ['*a = *b', '*b = tmp', 'dereference'],
  },

  // ---------- stack_and_heap ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'stack_and_heap',
    variant: 1,
    segs: [33, 22],
    stem: 'int *make(void) { int n = 50; return &n; } main stores the returned pointer, calls a few other functions, and then reads *p. Why is this dangerous?',
    options: {
      a: 'n lived in make’s stack frame, which is reused after make returns, so p may now point at garbage',
      b: 'It is fine: local variables live on the heap until the program ends',
      c: 'It is fine: returning &n moves n to the heap automatically',
      d: 'It is dangerous only because n was never freed',
    },
    correct: 'a',
    explanation:
      'Locals live in their function’s stack frame. Once make returns, that memory is handed to the next calls, so the old address refers to whatever they wrote there: the garbage values described in lecture.',
    distractors: {
      b: [
        'Local variables are stored on the heap',
        'Locals and arguments live on the stack; only malloc’d memory lives on the heap.',
      ],
      c: [
        'Taking a local’s address relocates it',
        'Nothing moves; the address still points into a frame that no longer belongs to make.',
      ],
      d: [
        'Stack variables must be freed',
        'free is only for malloc’d memory; stack frames are reclaimed automatically when a function returns.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'stack_and_heap',
    variant: 2,
    segs: [31, 32, 39],
    stem: 'A program keeps calling malloc in a loop while also recursing more and more deeply. In the lecture’s picture of memory, what can eventually happen?',
    options: {
      a: 'The heap growing from one side and the stack growing from the other can collide, because memory is finite',
      b: 'Nothing: the stack and the heap each have unlimited room',
      c: 'The stack takes over the heap’s memory whenever it needs more, so it can never run out',
      d: 'Only the heap can run out; function calls use no memory',
    },
    correct: 'a',
    explanation:
      'The heap grows toward the stack and the stack toward the heap. Excessive allocation or very deep recursion uses up the space between them: the reason to allocate only what you need.',
    distractors: {
      b: [
        'Memory regions are unlimited',
        'Both live in the same finite memory; that is why they can collide.',
      ],
      c: [
        'The stack can borrow heap memory',
        'The regions do not swap space; running out shows up as failed allocations or a crash.',
      ],
      d: [
        'Function calls are free',
        'Every call gets a stack frame, which is why the deep recursion in Lecture 3 crashed.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'stack_and_heap',
    variant: 1,
    segs: [31, 33, 22],
    sentences: [
      'When main calls swap, swap gets its own frame on the stack, above main’s frame.',
      'swap’s arguments and local variables, such as tmp, live in that frame.',
      'When swap returns, its frame is no longer in use, and its memory can be reused by the next function call.',
      'Memory from malloc also lives in the caller’s stack frame, so it is freed automatically when that function returns.',
      'Leftover values in reused memory are why we see garbage values.',
    ],
    flaw: {
      idx: 3,
      summary: 'malloc’d memory lives on the heap and stays allocated until it is freed.',
      correction:
        'malloc allocates from the heap, not the stack, so the memory stays allocated after the function returns until you call free.',
    },
    explanation:
      'Stack frames are reclaimed automatically when a function returns; heap memory is not. That difference is why you must free what you malloc, and why a function can safely return a malloc’d pointer but not a pointer to a local.',
    rubric: [
      'Heap lifetime',
      'States that malloc’d memory comes from the heap and remains allocated until freed, regardless of function returns.',
    ],
    hints: [
      'Recall where the lecture’s memory diagram puts malloc’s memory.',
      'If malloc’d memory vanished on return, why would we ever need free?',
    ],
    leak: ['heap', 'until free', 'not the stack'],
  },
  {
    kind: 'spot_flaw',
    concept: 'stack_and_heap',
    variant: 2,
    segs: [31, 32, 39],
    sentences: [
      'A running program’s machine code is loaded at one end of its memory, followed by its global variables.',
      'Below those is the heap, which malloc allocates from.',
      'At the other end is the stack, which grows toward the heap as functions are called.',
      'If both keep growing, they can eventually collide, because memory is finite.',
    ],
    flaw: null,
    explanation:
      'This matches the lecture’s model exactly: machine code, globals, the heap growing one way and the stack growing the other, with a risk of collision when memory runs out.',
    rubric: [
      'Justifies the verdict',
      'Confirms the layout order and explains why the two regions can collide.',
    ],
    hints: [
      'Picture the lecture’s rectangle of memory from one end to the other.',
      'Which region does malloc use and which do function calls use?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },
]
