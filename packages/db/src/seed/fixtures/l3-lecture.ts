import type { LectureFx } from './types'

/**
 * CS50x 2026 Lecture 3 (Algorithms), core window 1:12:30–1:57:30: sorting, recursion, merge sort.
 * Segments are concise paraphrases of what is taught at each moment (official subtitles:
 * https://cdn.cs50.net/2025/fall/lectures/3/lang/en/lecture3.srt), not verbatim transcript.
 */
export const lecture3: LectureFx = {
  key: 'l3',
  seq: 3,
  title: 'Lecture 3: Algorithms',
  youtubeId: '6Svu_ae5ebk',
  start: '1:12:30',
  end: '1:57:30',
  duration: '1:59:10',
  fallbackAudioUrl: 'https://cdn.cs50.net/2025/fall/lectures/3/lecture3.mp3',
  segments: [
    {
      idx: 0,
      at: '1:12:30',
      text: "Let's formalize what our volunteers just did, starting with selection sort. Think of the eight of them as an array, from location 0 up to location n minus 1.",
    },
    {
      idx: 1,
      at: '1:13:00',
      text: 'Selection sort in pseudocode: for i from 0 to n minus 1, find the smallest number between numbers[i] and numbers[n - 1], then swap that smallest number with the number at location i.',
    },
    {
      idx: 2,
      at: '1:14:30',
      text: 'On each pass I walked past every remaining element, keeping just one variable in my head for the smallest value seen so far, and then moved that value into place.',
    },
    {
      idx: 3,
      at: '1:15:00',
      text: "Why all the swapping? With an array you're not entitled to the memory to the left or right. You committed in advance to a fixed number of slots, so we swap rather than make room.",
    },
    {
      idx: 4,
      at: '1:16:00',
      text: 'There is often a trade-off between how much memory and how much time you use. So how fast is selection sort? On the first pass over n people I made n minus 1 comparisons.',
    },
    {
      idx: 5,
      at: '1:17:00',
      text: 'Each pass solves one more problem, so the total is (n - 1) + (n - 2) + ... + 1 comparisons. That series equals n(n - 1)/2, which multiplies out to n squared over 2 minus n over 2.',
    },
    {
      idx: 6,
      at: '1:17:30',
      text: 'With big O notation we wave our hands at the lower-order terms and constant factors and keep only the dominant term, the one that matters most when n gets really big. Here that is n squared.',
    },
    {
      idx: 7,
      at: '1:18:30',
      text: "So selection sort is in O(n squared), far slower than linear search, which was O(n). But what about its lower bound? Maybe it's fast when the numbers are already mostly sorted?",
    },
    {
      idx: 8,
      at: '1:19:00',
      text: 'Unfortunately the pseudocode never checks whether the list is already sorted. Even if the volunteers were already in order, I would still walk back and forth finding the smallest element every single time.',
    },
    {
      idx: 9,
      at: '1:19:30',
      text: 'So even in the best case selection sort is in omega of n squared. Since its big O and omega are one and the same, we can say selection sort is in theta of n squared.',
    },
    {
      idx: 10,
      at: '1:20:00',
      text: 'Bubble sort, the second algorithm, compares neighbors. Repeat n times: for i from 0 to n minus 2, if numbers[i] and numbers[i + 1] are out of order, swap them.',
    },
    {
      idx: 11,
      at: '1:21:30',
      text: 'Why stop i at n minus 2? Because we compare location i with location i + 1. If i reached n minus 1, then i + 1 would be n, which is past the end of the array.',
    },
    {
      idx: 12,
      at: '1:22:00',
      text: 'True to its name, the biggest element bubbles up to the end first, then the next biggest, and so on. You could even repeat just n minus 1 times, since the last element ends up in place for free.',
    },
    {
      idx: 13,
      at: '1:23:00',
      text: 'You can often infer running time from pseudocode. The outer loop repeats about n minus 1 times, the inner loop about n minus 1 times, and comparing or swapping two numbers takes a constant number of steps.',
    },
    {
      idx: 14,
      at: '1:24:00',
      text: 'Multiply the loops: (n - 1) times (n - 1) is n squared minus 2n plus 1, which is on the order of n squared. So bubble sort is also in O(n squared), no better than selection sort in the worst case.',
    },
    {
      idx: 15,
      at: '1:25:00',
      text: 'And as written, bubble sort still asks every question even if the list is already sorted: it makes no swaps but repeats all of those comparisons.',
    },
    {
      idx: 16,
      at: '1:25:30',
      text: "Here's an enhancement selection sort had no room for: if a pass from left to right makes no swaps, quit. There is clearly no more work to be done.",
    },
    {
      idx: 17,
      at: '1:26:00',
      text: "With that change bubble sort is in omega of n: you still have to look at all n elements once to know the list is sorted. Because its O and omega differ, we can't state a theta for it.",
    },
    {
      idx: 18,
      at: '1:26:30',
      text: 'That optimization only helps when the list is already or mostly sorted. In the average and worst cases both algorithms still perform on the order of n squared.',
    },
    {
      idx: 19,
      at: '1:29:00',
      text: 'To do better we need a fundamentally different approach, a technique from mathematics and programming called recursion.',
    },
    {
      idx: 20,
      at: '1:29:30',
      text: 'A recursive function is one that is defined in terms of itself. In C, that simply means a function that calls itself.',
    },
    {
      idx: 21,
      at: '1:30:30',
      text: 'Recall our search of the sorted lockers: if the number is behind the middle door, return true; else if it is less than the middle number, search the left half; else if greater, search the right half.',
    },
    {
      idx: 22,
      at: '1:31:30',
      text: "Why doesn't that search loop forever even though it calls itself? Because each time it hands itself a smaller problem: half as many doors.",
    },
    {
      idx: 23,
      at: '1:32:00',
      text: 'Conditions that ask an obvious question and answer it immediately are base cases. The recursive cases do more work by calling the same algorithm on a smaller version of the problem.',
    },
    {
      idx: 24,
      at: '1:33:30',
      text: "Week 0's phone book search can be written recursively too: 'search the left half of the book' just means start the same algorithm again on a problem half as large.",
    },
    {
      idx: 25,
      at: '1:34:00',
      text: "Mario's pyramid is recursive: a pyramid of height 4 is a pyramid of height 3 plus one more row, and so on down to height 1, which is just a single brick. That last one is the base case.",
    },
    {
      idx: 26,
      at: '1:40:00',
      text: 'In code, draw(n) first calls draw(n - 1) to draw a pyramid of height n minus 1, and then prints one more row of n bricks itself.',
    },
    {
      idx: 27,
      at: '1:42:00',
      text: "Clang refuses to compile it: all paths through this function will call itself. I'm missing a base case, so add: if n is less than or equal to 0, just return.",
    },
    {
      idx: 28,
      at: '1:43:00',
      text: 'Now the problem shrinks from 4 to 3 to 2 to 1, and as soon as n hits 0 the calls finally return. The recursive version prints the exact same pyramid as the iterative one.',
    },
    {
      idx: 29,
      at: '1:45:00',
      text: 'Give it a huge height, though, and it crashes. Each call to draw uses a little more memory, and the computer only has so much. The iterative version would not have this problem.',
    },
    {
      idx: 30,
      at: '1:46:00',
      text: 'Merge sort uses recursion and makes far fewer comparisons than bubble sort or selection sort. Its pseudocode: sort the left half, sort the right half, then merge the sorted halves.',
    },
    {
      idx: 31,
      at: '1:46:30',
      text: 'It needs a base case too: if there is only one number, quit. A list of size 1 is already sorted.',
    },
    {
      idx: 32,
      at: '1:47:30',
      text: 'To merge two sorted halves, point one hand at the start of each list, take whichever number is smaller, put it on the top shelf, and advance that hand.',
    },
    {
      idx: 33,
      at: '1:48:30',
      text: 'My hands only ever move to the right, touching each number once and only once. So merging lists with n numbers in total takes n steps.',
    },
    {
      idx: 34,
      at: '1:50:30',
      text: 'How do I sort a list of size 1? I just return; that is the base case. Then I sort the right half and merge the two halves together.',
    },
    {
      idx: 35,
      at: '1:53:30',
      text: 'For eight numbers there were only about three levels of work, not n levels. The catch: merge sort needs extra space, like the second shelf I merged onto.',
    },
    {
      idx: 36,
      at: '1:54:30',
      text: 'On each level the merging touched all n elements, so every level costs n steps.',
    },
    {
      idx: 37,
      at: '1:55:00',
      text: 'With 8 elements there were 3 levels, and log base 2 of 8 is 3. So merge sort is not n squared: it is in O(n log n).',
    },
    {
      idx: 38,
      at: '1:56:00',
      text: 'There is no early-exit trick in our merge sort, so its lower bound is omega of n log n too, and therefore it is in theta of n log n.',
    },
    {
      idx: 39,
      at: '1:57:00',
      text: 'Side by side, selection sort and bubble sort crawl while merge sort finishes far sooner: that is the felt difference between n squared and n log n.',
    },
  ],
  concepts: [
    {
      key: 'binary_search',
      name: 'Binary search',
      summary:
        'Binary search finds a value in sorted data by comparing it with the middle element and then searching only the half that could still contain it, so each step halves the problem.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Compare the target with the middle element; if it is smaller search the left half, if larger search the right half.',
          segs: [21],
        },
        {
          id: 'kp2',
          text: 'Each step works on a problem half as large, which is why it terminates and why it is fast.',
          segs: [22, 24],
        },
        {
          id: 'kp3',
          text: 'It relies on sorted data: the comparison with the middle only tells you which half to discard if the values are in order.',
          segs: [21],
        },
        {
          id: 'kp4',
          text: 'Base cases answer immediately: no doors left means return false; found behind the middle door means return true.',
          segs: [23],
        },
      ],
      segs: [21, 22, 23, 24],
      salience: 0.55,
    },
    {
      key: 'asymptotic_notation',
      name: 'Big O, Ω and Θ',
      summary:
        'Big O gives an upper bound and Ω a lower bound on how running time grows with n, ignoring constants and lower-order terms; when the two bounds match, the running time is in Θ.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Keep only the dominant term and drop constant factors: n²/2 − n/2 is on the order of n².',
          segs: [5, 6],
        },
        {
          id: 'kp2',
          text: 'O is an upper bound (usually discussed for the worst case); Ω is a lower bound (e.g. the best case).',
          segs: [7, 9],
        },
        {
          id: 'kp3',
          text: 'When an algorithm’s O and Ω bounds are the same, it is in Θ of that bound; when they differ, no single Θ applies.',
          segs: [9, 17, 38],
        },
        {
          id: 'kp4',
          text: 'Running time can be read off pseudocode: two nested loops over about n elements give about n² steps; constant-time steps do not matter.',
          segs: [13, 14],
        },
      ],
      segs: [5, 6, 7, 9, 13, 14, 17, 37, 38],
      salience: 0.8,
    },
    {
      key: 'selection_sort',
      name: 'Selection sort',
      summary:
        'Selection sort repeatedly selects the smallest remaining element and swaps it into the next position, making about n²/2 comparisons even on sorted input, so it is in Θ(n²).',
      keyPoints: [
        {
          id: 'kp1',
          text: 'For i from 0 to n − 1, find the smallest element between positions i and n − 1 and swap it into position i.',
          segs: [1, 2],
        },
        {
          id: 'kp2',
          text: 'It makes (n − 1) + (n − 2) + … + 1 = n(n − 1)/2 comparisons, which is O(n²).',
          segs: [4, 5, 7],
        },
        {
          id: 'kp3',
          text: 'It never checks whether the list is already sorted, so its best case is also Ω(n²), making it Θ(n²).',
          segs: [8, 9],
        },
        {
          id: 'kp4',
          text: 'It needs only one extra variable to remember the current smallest value: a time-for-memory trade-off.',
          segs: [2, 4],
        },
      ],
      segs: [0, 1, 2, 3, 4, 5, 7, 8, 9],
      salience: 0.85,
    },
    {
      key: 'bubble_sort',
      name: 'Bubble sort',
      summary:
        'Bubble sort repeatedly swaps adjacent out-of-order pairs so the largest values bubble to the end; it is O(n²), and stopping after a pass with no swaps makes its best case Ω(n).',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Repeat: for i from 0 to n − 2, if numbers[i] and numbers[i + 1] are out of order, swap them.',
          segs: [10, 11],
        },
        {
          id: 'kp2',
          text: 'The inner loop stops at n − 2 so that i + 1 never goes past the end of the array.',
          segs: [11],
        },
        {
          id: 'kp3',
          text: 'Each pass bubbles the largest remaining value into its final place at the end.',
          segs: [12],
        },
        {
          id: 'kp4',
          text: 'Two nested loops of about n − 1 iterations give (n − 1)² steps, so bubble sort is O(n²).',
          segs: [13, 14],
        },
        {
          id: 'kp5',
          text: 'If a pass makes no swaps, stop: sorted input then takes one pass, Ω(n), but the average and worst cases stay n².',
          segs: [16, 17, 18],
        },
      ],
      segs: [10, 11, 12, 13, 14, 15, 16, 17, 18],
      salience: 0.85,
    },
    {
      key: 'recursion',
      name: 'Recursion',
      summary:
        'A recursive function calls itself on a smaller version of the same problem and needs a base case that answers directly, otherwise it never stops.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'A recursive function is defined in terms of itself; in C, a function that calls itself.',
          segs: [20],
        },
        {
          id: 'kp2',
          text: 'Base cases answer immediately; recursive cases call the function again on a smaller problem.',
          segs: [22, 23],
        },
        {
          id: 'kp3',
          text: 'A pyramid of height n is a pyramid of height n − 1 plus one more row, so draw(n) calls draw(n − 1) and then prints n bricks.',
          segs: [25, 26],
        },
        {
          id: 'kp4',
          text: 'Without a base case such as "if n <= 0, return" the calls never end; clang even refuses to compile when every path calls itself.',
          segs: [27, 28],
        },
        {
          id: 'kp5',
          text: 'Every call uses a bit more memory, so very deep recursion can crash where an equivalent loop would not.',
          segs: [29],
        },
      ],
      segs: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31],
      salience: 0.8,
    },
    {
      key: 'merge_sort',
      name: 'Merge sort',
      summary:
        'Merge sort sorts the left half, sorts the right half and merges the sorted halves; about log₂ n levels of n-step merging make it Θ(n log n), at the cost of extra memory.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Sort the left half, sort the right half, merge the sorted halves; a list of one element is already sorted (base case).',
          segs: [30, 31, 34],
        },
        {
          id: 'kp2',
          text: 'Merging two sorted lists takes n steps: compare the two front elements, take the smaller, and only ever move forward.',
          segs: [32, 33],
        },
        {
          id: 'kp3',
          text: 'There are about log₂ n levels of halving and each level does n steps of merging, so merge sort is O(n log n).',
          segs: [36, 37],
        },
        {
          id: 'kp4',
          text: 'It has no early exit, so it is also Ω(n log n), i.e. Θ(n log n), even on sorted input.',
          segs: [38],
        },
        {
          id: 'kp5',
          text: 'The trade-off is space: merging needs extra memory to merge into.',
          segs: [35],
        },
      ],
      segs: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
      salience: 0.9,
    },
  ],
}
