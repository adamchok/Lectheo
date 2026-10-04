import type { LectureFx } from './types'

/**
 * CS50x 2026 Lecture 4 (Memory), core window 1:02:00–1:48:30: copying strings, malloc/NULL,
 * free/leaks/Valgrind, pointers (Binky), swap by value vs by reference, stack and heap.
 * Paraphrased from https://cdn.cs50.net/2025/fall/lectures/4/lang/en/lecture4.srt.
 */
export const lecture4: LectureFx = {
  key: 'l4',
  seq: 4,
  title: 'Lecture 4: Memory',
  youtubeId: 'db0H0U13YsA',
  start: '1:02:00',
  end: '1:48:30',
  duration: '2:19:30',
  fallbackAudioUrl: 'https://cdn.cs50.net/2025/fall/lectures/4/lecture4.mp3',
  segments: [
    {
      idx: 0,
      at: '1:02:00',
      text: 'To copy "hi!" we need 4 bytes, because of the null character at the end. So no more training wheels: declare another char * called t and set it to the return value of a new function, malloc.',
    },
    {
      idx: 1,
      at: '1:02:30',
      text: "malloc asks the operating system for some number of bytes and returns the address of the first byte of that chunk. I don't know where in memory it will be, and I don't need to care.",
    },
    {
      idx: 2,
      at: '1:03:00',
      text: "Rather than hard-coding 4, ask for strlen(s) + 1 bytes: the length of hi! is 3, but underneath the hood we need that fourth byte for the terminator. malloc's prototype is in stdlib.h.",
    },
    {
      idx: 3,
      at: '1:04:30',
      text: "There's a subtle bug: strlen returns the real-world length, 3 for hi!, so looping while i < strlen(s) forgets to copy the null character.",
    },
    {
      idx: 4,
      at: '1:05:00',
      text: "Instead of hard-coding t[4] = '\\0', loop up to and through the length: i <= n. Starting at 0, that iterates 4 times and copies the terminator too.",
    },
    {
      idx: 5,
      at: '1:06:30',
      text: 'Now s is unchanged and only t is capitalized, because t points to a different chunk of memory from malloc, which initially contained garbage values until we copied into it.',
    },
    {
      idx: 6,
      at: '1:07:30',
      text: 'We do not even need our own loop: strcpy copies a string for us, as long as we allocated enough memory. Careful with the order: the destination comes first, then the source.',
    },
    {
      idx: 7,
      at: '1:08:30',
      text: 'NUL with one L, backslash zero, is a single byte of all zero bits that terminates a string. NULL with two Ls is something different: a special memory address.',
    },
    {
      idx: 8,
      at: '1:09:00',
      text: 'NULL is address 0x0. Humans decided never to put anything at address 0, so a function can return it as a special value meaning something went wrong.',
    },
    {
      idx: 9,
      at: '1:10:00',
      text: "Per its documentation, get_string can return NULL on error, for instance if there's no room in memory for what the human typed. So we should check: if s == NULL, return 1.",
    },
    {
      idx: 10,
      at: '1:10:30',
      text: 'The same is true of malloc. If the address in t equals NULL, the computer could not give us the memory, so return 1 rather than touch it.',
    },
    {
      idx: 11,
      at: '1:11:30',
      dur: 40,
      text: 'I also ask for memory and never give it back. In a short program the computer reclaims it when the program quits, but in long-running programs, if you malloc and never free, the computer thinks it is using more and more memory. So call free(t) when done.',
    },
    {
      idx: 12,
      at: '1:12:30',
      text: "Not freeing memory you no longer need is called a memory leak. If an app on your computer or phone gets slower and slower the longer it runs, that's often the symptom.",
    },
    {
      idx: 13,
      at: '1:13:30',
      text: "Rule of thumb: if you malloc'd it, you must free it. CS50's get_string frees its own memory automatically, which is why we never freed s.",
    },
    {
      idx: 14,
      at: '1:15:00',
      text: 'Instead of hard-coding 3 times 4 bytes, use sizeof(int) to ask how big an int is on this system. Chars are always 1 byte; ints are usually 4, and sizeof keeps the code portable.',
    },
    {
      idx: 15,
      at: '1:15:30',
      text: 'So int *x = malloc(3 * sizeof(int)) dynamically gets space for three integers and stores the address of that chunk in x.',
    },
    {
      idx: 16,
      at: '1:16:00',
      text: 'This program is riddled with mistakes: it fills x[1], x[2] and x[3] instead of indices 0 through 2, and it never calls free, so it has a memory leak.',
    },
    {
      idx: 17,
      at: '1:17:30',
      dur: 40,
      text: 'It compiles and runs without any visible error, so run valgrind ./memory, a common tool for memory errors. One insight: invalid write of size 4 on line 11, where I write an int past the end of the 12 bytes.',
    },
    {
      idx: 18,
      at: '1:19:00',
      text: 'Then the leak summary: definitely lost, 12 bytes in 1 blocks, traced to line 8. Three ints of 4 bytes each is the 12 bytes I malloced and never freed.',
    },
    {
      idx: 19,
      at: '1:20:30',
      text: 'The square brackets are syntactic sugar for pointer arithmetic: x[1] = 73 means the same as *(x + 1) = 73, go to the address in x plus one int and put 73 there.',
    },
    {
      idx: 20,
      at: '1:21:30',
      text: 'Still a subtle bug: any time you call malloc you should check whether it returned NULL before touching that memory. If x == NULL, return 1.',
    },
    {
      idx: 21,
      at: '1:22:30',
      text: 'Run Valgrind again: all heap blocks were freed, no leaks are possible, and zero errors.',
    },
    {
      idx: 22,
      at: '1:25:00',
      text: 'Garbage values are remnants of whatever previously used that memory, not values I put there myself. You just should not touch memory you have not initialized.',
    },
    {
      idx: 23,
      at: '1:26:00',
      text: 'int *x and int *y declare two pointers without initializing them. x = malloc(sizeof(int)) gives x the address of 4 bytes, and *x = 42 dereferences x: go to that chunk and put 42 there.',
    },
    {
      idx: 24,
      at: '1:26:30',
      text: '*y = 13 is unlucky: y was never assigned, so it holds a garbage address. Dereferencing an invalid, bogus pointer like that is worse than reading an uninitialized variable.',
    },
    {
      idx: 25,
      at: '1:28:00',
      text: 'In the Binky claymation, pointers start out not pointing to anything. The things they point to are called pointees, and setting up a pointee is a separate step.',
    },
    {
      idx: 26,
      at: '1:29:00',
      text: 'Dereferencing x follows the arrow to its pointee and stores 42. Dereferencing y fails, because y was never given a pointee.',
    },
    {
      idx: 27,
      at: '1:29:30',
      dur: 40,
      text: 'Pointer assignment, y = x, does not touch the pointees: it just makes y point to the same place as x. Now dereferencing y works, and since they share one pointee, both see the 13.',
    },
    {
      idx: 28,
      at: '1:37:00',
      text: 'swap(int a, int b) grabs an empty glass called temp: temp = a, then a = b, then b = temp. A literal translation of what our volunteer Olivia did with the two drinks.',
    },
    {
      idx: 29,
      at: '1:38:00',
      text: 'But after main calls swap(x, y), x is still 1 and y is still 2. It did not work.',
    },
    {
      idx: 30,
      at: '1:39:00',
      text: 'In C, any time you pass arguments to a function you pass them by value: the function receives copies of the variables, in a different scope from the originals.',
    },
    {
      idx: 31,
      at: '1:40:30',
      text: "Memory layout: the program's machine code at one end, global variables below that, then the heap, the big chunk of memory malloc allocates from.",
    },
    {
      idx: 32,
      at: '1:41:00',
      text: 'The heap grows in one direction, and from the other end the stack grows toward it. The stack is used whenever you call functions and create local variables.',
    },
    {
      idx: 33,
      at: '1:42:00',
      text: 'main gets a frame on the stack; when main calls swap, swap gets the next frame above it for its arguments and locals. When swap returns that memory is reused later, which is where garbage values come from.',
    },
    {
      idx: 34,
      at: '1:44:00',
      text: 'a is a copy of x and b is a copy of y. swap successfully swaps a and b, but nobody ever touched x or y, so when swap returns they are unchanged.',
    },
    {
      idx: 35,
      at: '1:44:30',
      text: 'Now we can pass by reference instead: use pointers to tell the function how to go to the addresses of x and y and change the values there.',
    },
    {
      idx: 36,
      at: '1:45:00',
      text: 'Change the parameters to int *a and int *b, addresses of ints. Then temp = *a; *a = *b; *b = temp: go to those addresses to read and write.',
    },
    {
      idx: 37,
      at: '1:46:00',
      text: 'Star with a type to its left declares a pointer. Star with no type to its left means dereference: go to that address.',
    },
    {
      idx: 38,
      at: '1:46:30',
      dur: 40,
      text: 'main calls swap(&x, &y), so a points to x and b points to y. Swap follows the arrows and changes the originals; we gave it a treasure map to x and y, not copies.',
    },
    {
      idx: 39,
      at: '1:48:00',
      text: 'One problem remains: the heap grows toward the stack. The more you malloc and the more functions you call, the closer they get, so only allocate the memory you need.',
    },
  ],
  concepts: [
    {
      key: 'strings_as_char_pointers',
      name: 'Strings as char *',
      summary:
        "A C string is a char * holding the address of its first character, with the characters stored back to back and ended by the '\\0' terminator, so a real copy needs strlen + 1 bytes of its own.",
      keyPoints: [
        {
          id: 'kp1',
          text: 'A string is really a char *: the address of its first character.',
          segs: [0],
        },
        {
          id: 'kp2',
          text: 'Strings end with the \'\\0\' terminator, so "hi!" needs 4 bytes: malloc(strlen(s) + 1).',
          segs: [0, 2],
        },
        {
          id: 'kp3',
          text: 'A copy must include the terminator: loop through i <= strlen(s), or use strcpy(destination, source).',
          segs: [3, 4, 6],
        },
        {
          id: 'kp4',
          text: "NUL ('\\0') ends a string; NULL is the special address 0x0. They are different things.",
          segs: [7],
        },
        {
          id: 'kp5',
          text: 'After allocating and copying, t points to different memory than s, so changing t leaves s alone.',
          segs: [5],
        },
      ],
      segs: [0, 2, 3, 4, 5, 6, 7],
      salience: 0.7,
    },
    {
      key: 'malloc_and_null',
      name: 'malloc and NULL checks',
      summary:
        'malloc asks the operating system for a number of bytes on the heap and returns the address of the first one, or NULL if it cannot, so every result must be checked before the memory is used.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'malloc(n) returns the address of the first of n bytes; you do not choose where they are.',
          segs: [1],
        },
        {
          id: 'kp2',
          text: 'Ask for the size portably with sizeof, e.g. malloc(3 * sizeof(int)).',
          segs: [14, 15],
        },
        {
          id: 'kp3',
          text: 'malloc (like get_string) returns NULL, address 0x0, when it cannot oblige.',
          segs: [8, 9, 10],
        },
        {
          id: 'kp4',
          text: 'Check whether the pointer is NULL and stop (e.g. return 1) before touching the memory.',
          segs: [10, 20],
        },
      ],
      segs: [1, 2, 8, 9, 10, 14, 15, 20],
      salience: 0.75,
    },
    {
      key: 'memory_leaks',
      name: 'free, memory leaks and Valgrind',
      summary:
        'Memory from malloc stays allocated until you free it, so forgetting free leaks memory, which Valgrind reports as "definitely lost" bytes alongside invalid reads and writes.',
      keyPoints: [
        {
          id: 'kp1',
          text: "If you malloc'd it, you must free it once you are done with it.",
          segs: [11, 13],
        },
        {
          id: 'kp2',
          text: 'A leak is memory that is never freed; long-running programs get slower as the computer thinks that memory is still in use.',
          segs: [11, 12],
        },
        {
          id: 'kp3',
          text: 'Valgrind reports invalid writes (e.g. past the end of a malloc’d block) and leaked bytes, with the line numbers involved.',
          segs: [17, 18],
        },
        {
          id: 'kp4',
          text: 'After the fix, Valgrind reports that all heap blocks were freed: no leaks are possible.',
          segs: [21],
        },
      ],
      segs: [11, 12, 13, 16, 17, 18, 21],
      salience: 0.75,
    },
    {
      key: 'pointers',
      name: 'Pointers and dereferencing',
      summary:
        'A pointer stores a memory address and * goes to that address, so a pointer must first point at valid memory (a pointee); dereferencing an uninitialized pointer follows a garbage address.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'A pointer is a variable whose value is an address; *x means go to that address.',
          segs: [23, 26],
        },
        {
          id: 'kp2',
          text: 'Declaring a pointer does not create a pointee; setting one up (malloc, or pointing at existing memory) is a separate step.',
          segs: [25],
        },
        {
          id: 'kp3',
          text: 'An uninitialized pointer holds a garbage address, and dereferencing it can crash or corrupt memory.',
          segs: [22, 24],
        },
        {
          id: 'kp4',
          text: 'Pointer assignment y = x copies the address, so both point at the same pointee and see the same value.',
          segs: [27],
        },
        {
          id: 'kp5',
          text: 'x[i] is syntactic sugar for *(x + i): pointer arithmetic moves in units of the pointed-to type.',
          segs: [19],
        },
      ],
      segs: [19, 22, 23, 24, 25, 26, 27],
      salience: 0.8,
    },
    {
      key: 'pass_by_reference',
      name: 'Passing by value vs. by reference (swap)',
      summary:
        'C passes arguments by value, so swap(int a, int b) only exchanges its own copies; to change the caller’s variables you pass their addresses (&x, &y) and dereference them inside swap.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Arguments in C are passed by value: the function receives copies of x and y.',
          segs: [30],
        },
        {
          id: 'kp2',
          text: 'So swap(int a, int b) exchanges a and b, while x and y in main stay unchanged.',
          segs: [28, 29, 34],
        },
        {
          id: 'kp3',
          text: 'Pass by reference: swap(int *a, int *b) with temp = *a; *a = *b; *b = temp.',
          segs: [35, 36, 37],
        },
        {
          id: 'kp4',
          text: 'The caller passes addresses, swap(&x, &y), so swap follows the pointers to the originals.',
          segs: [38],
        },
      ],
      segs: [28, 29, 30, 33, 34, 35, 36, 37, 38],
      salience: 0.9,
    },
    {
      key: 'stack_and_heap',
      name: 'Stack and heap',
      summary:
        "malloc'd memory comes from the heap, while each function call gets a frame on the stack for its arguments and locals that is reused after it returns; the two regions grow toward each other.",
      keyPoints: [
        {
          id: 'kp1',
          text: 'Memory layout: machine code, then globals, then the heap that malloc allocates from.',
          segs: [31],
        },
        {
          id: 'kp2',
          text: 'The stack holds function calls and local variables; each call gets its own frame on top of its caller’s.',
          segs: [32, 33],
        },
        {
          id: 'kp3',
          text: 'When a function returns, its frame is reused by later calls, one source of garbage values.',
          segs: [22, 33],
        },
        {
          id: 'kp4',
          text: 'The heap and stack grow toward each other; too much malloc or too many nested calls can make them collide.',
          segs: [39],
        },
      ],
      segs: [31, 32, 33, 39],
      salience: 0.6,
    },
  ],
}
