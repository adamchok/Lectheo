import type { LectureFx } from './types'

/**
 * CS50x 2026 Lecture 5 (Data Structures), core window 1:18:54–2:02:54 (video time): arrays vs
 * linked lists, binary search trees, hashing, hash tables and tries.
 * Paraphrased from https://cdn.cs50.net/2025/fall/lectures/5/lang/en/lecture5.srt.
 * That .srt is timed against the livestream (1 h pre-show, then a cut at ~1:31:00); all times
 * here are video/MP3 time (= srt time − 57:36 in this window), matching
 * hls/subtitles/en/en.vtt, the YouTube video and lecture5.mp3 (2:03:50).
 */
export const lecture5: LectureFx = {
  key: 'l5',
  seq: 5,
  title: 'Lecture 5: Data Structures',
  youtubeId: 'PmAI76OGE_E',
  start: '1:18:54',
  end: '2:02:54',
  duration: '2:03:50',
  fallbackAudioUrl: 'https://cdn.cs50.net/2025/fall/lectures/5/lecture5.mp3',
  segments: [
    {
      idx: 0,
      at: '1:18:54',
      dur: 40,
      text: "So what's the running time of inserting into our sorted linked list? O(n). Searching it? O(n). Deleting from it? Also O(n). That's the price we've paid for being able to grow and shrink dynamically.",
    },
    {
      idx: 1,
      at: '1:20:24',
      text: 'Recap: we started with arrays, whose appeal is that they are fast. Because they are stored back to back, contiguously, simple arithmetic tells us where the middle is.',
    },
    {
      idx: 2,
      at: '1:20:54',
      text: 'So sorted arrays lend themselves to binary search, O(log n). The downside: you decide the size in advance, and if you guess too small you must allocate new memory and copy everything over, with malloc or realloc.',
    },
    {
      idx: 3,
      at: '1:21:24',
      text: 'Copying 3 million values to a new location wastes a huge amount of time. That motivated linked lists, where we allocate memory only as we need it, one node at a time.',
    },
    {
      idx: 4,
      at: '1:21:54',
      text: 'Once allocated, nodes stay where they are and we just update pointers. But searching, inserting and deleting all seem to be O(n) in a linked list.',
    },
    {
      idx: 5,
      at: '1:22:24',
      text: "Our latest linked list was sorted, which is a precondition for binary search. Our human eyes can see where the middle is, but how would the code find it? You can't just jump there.",
    },
    {
      idx: 6,
      at: '1:22:54',
      dur: 40,
      text: 'You would traverse from the beginning to learn the length, then again to stop halfway: O(n) just to find the middle. And keeping a pointer to every middle would essentially turn it back into an array.',
    },
    {
      idx: 7,
      at: '1:24:24',
      text: "So let's mash up arrays and linked lists to get the speed of arrays with the dynamism of linked lists. I give you trees, like a family tree, with the root at the top.",
    },
    {
      idx: 8,
      at: '1:25:24',
      text: 'Binary search trees give us back the ability to do binary search by storing the data in two dimensions instead of one.',
    },
    {
      idx: 9,
      at: '1:26:24',
      text: 'Explode a sorted array of seven numbers vertically: the middle element, 4, becomes the root; 2 and 6 hang to its left and right; the nodes at the edges, with no children, are leaves.',
    },
    {
      idx: 10,
      at: '1:27:24',
      text: 'Each node is now drawn as a square but holds three things: a number and two pointers, one to its left child and one to its right child.',
    },
    {
      idx: 11,
      at: '1:27:54',
      text: 'Searching for 5: at the root, 4 is less than 5, so 5 must be to the right. We never look at the left subtree at all, effectively halving the problem like the phone book.',
    },
    {
      idx: 12,
      at: '1:28:54',
      text: 'The key property: every node is greater than its left child and less than its right child, and that holds recursively, for every subtree. A binary search tree is a recursive data structure.',
    },
    {
      idx: 13,
      at: '1:29:54',
      text: 'Searching takes O(log n), because the height of this tree is about log base 2 of n.',
    },
    {
      idx: 14,
      at: '1:30:54',
      text: 'Inserting is easy, just update pointers without copying everything like an array. The price: each node stores a number and two pointers, roughly three times the memory.',
    },
    {
      idx: 15,
      at: '1:33:24',
      text: 'In C, search(tree, number): base case, if the tree is NULL, return false. If the number is less than the number in this node, search the left subtree.',
    },
    {
      idx: 16,
      at: '1:33:54',
      text: 'If it is greater, search the right subtree; if it is equal, return true. Each subtree is just a smaller tree, so this is a beautiful application of recursion.',
    },
    {
      idx: 17,
      at: '1:37:24',
      text: 'But suppose the user inserts 1, then 2, then 3, then 4, 5, 6. To keep the property, every new number hangs off to the right. I have accidentally built a linked list.',
    },
    {
      idx: 18,
      at: '1:37:54',
      text: "A long, stringy tree doesn't violate the binary search tree definition, but it is not balanced, and searching it devolves into O(n). Fancier trees rebalance themselves as you insert.",
    },
    {
      idx: 19,
      at: '1:39:24',
      text: 'The holy grail of data structures is O(1), constant time: a number of steps independent of how much data is in the structure.',
    },
    {
      idx: 20,
      at: '1:40:54',
      text: 'Hashing takes inputs from an infinite domain and maps them to a finite range of outputs. Sorting a deck of cards into four suit buckets first is a kind of hashing.',
    },
    {
      idx: 21,
      at: '1:42:54',
      text: 'A hash function is the function that decides, for any input such as a card or a word, which bucket it goes into.',
    },
    {
      idx: 22,
      at: '1:44:24',
      text: 'Hash on the first letter: 26 buckets for A through Z. hash("Mario") returns 12 and hash("Luigi") returns 11, because we count buckets from 0 like array indices.',
    },
    {
      idx: 23,
      at: '1:45:24',
      text: "In C: take the name's first letter, convert it to uppercase, and subtract 'A', which returns a number from 0 to 25.",
    },
    {
      idx: 24,
      at: '1:47:54',
      text: 'Hash tables are the Swiss Army knife of data structures. They associate keys with values, which is how dictionaries, collections of key-value pairs, are often implemented.',
    },
    {
      idx: 25,
      at: '1:48:54',
      text: 'A hash table here is an array of 26 pointers to nodes. In short, a hash table is an array of linked lists.',
    },
    {
      idx: 26,
      at: '1:49:54',
      text: 'Every bucket starts as NULL. To add Mario, create a new node and link it from the M bucket; Luigi goes off the L bucket.',
    },
    {
      idx: 27,
      at: '1:50:54',
      text: 'But mapping an infinite number of names to a finite number of buckets means collisions: multiple names inevitably land in the same bucket.',
    },
    {
      idx: 28,
      at: '1:51:24',
      text: "Putting a colliding name in the next free slot devolves into a linear mess. Instead, chain it: link the new node into that bucket's linked list.",
    },
    {
      idx: 29,
      at: '1:52:24',
      text: 'Searching one long linked list would be O(n). With k buckets and names spread uniformly, each chain is only about n divided by k long.',
    },
    {
      idx: 30,
      at: '1:53:24',
      text: "With collisions we can't just jump to the person; we have to walk the chain. A smarter hash function, say on the first three letters, makes collisions less likely.",
    },
    {
      idx: 31,
      at: '1:54:24',
      dur: 40,
      text: 'The trade-off is a lot more memory: buckets for every combination like AAA and AAB, most of which go unused. You want a hash function smarter than the first letter, but not so wasteful.',
    },
    {
      idx: 32,
      at: '1:55:24',
      text: 'Even with chains of about n over k, big O ignores the constant k: O(n/k) is still O(n). We have strayed from constant-time search again.',
    },
    { idx: 33, at: '1:55:54', text: 'Tries, short for retrieval, are trees made out of arrays.' },
    {
      idx: 34,
      at: '1:56:54',
      text: 'Each node in a trie is an array of 26 pointers indexed A through Z. You follow the pointer for the first letter of a name, then the second letter, and so on.',
    },
    {
      idx: 35,
      at: '1:57:24',
      text: 'To insert Toad, change the T pointer from NULL to a new node, then O, then A, then D, where a boolean marks that a name ends there.',
    },
    {
      idx: 36,
      at: '1:58:24',
      text: 'Toadette continues past the D node to E, T, T, E with its own end marker, so names that are prefixes of each other share nodes; Tom reuses the T and O nodes.',
    },
    {
      idx: 37,
      at: '1:59:54',
      text: 'To look up Toad, start at the root and follow T, then O, then A, then D, and check the boolean that says Toad is in the trie.',
    },
    {
      idx: 38,
      at: '2:00:24',
      text: "Whether there are 3 names or 3 million, that lookup takes 4 steps. It depends only on the name's length, which is bounded, so it is effectively constant time.",
    },
    {
      idx: 39,
      at: '2:02:24',
      text: 'So why not always use tries? They take a huge amount of memory: 26 pointers per node, and most of those pointers are just NULL.',
    },
  ],
  concepts: [
    {
      key: 'arrays',
      name: 'Arrays: contiguity and resizing cost',
      summary:
        'An array stores elements back to back, so any index is reachable by arithmetic and a sorted array supports O(log n) binary search, but its size is fixed and growing it means allocating a bigger block and copying every element.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Elements are contiguous, so the middle (or any index) is found with simple arithmetic.',
          segs: [1],
        },
        {
          id: 'kp2',
          text: 'That is what makes binary search on a sorted array possible: O(log n).',
          segs: [2],
        },
        {
          id: 'kp3',
          text: 'The size is decided in advance; growing means allocating new memory and copying all n elements, O(n).',
          segs: [2, 3],
        },
      ],
      segs: [1, 2, 3, 6],
      salience: 0.5,
    },
    {
      key: 'linked_lists',
      name: 'Linked lists',
      summary:
        'A linked list stores each value in a node with a pointer to the next, so it grows one node at a time without copying, but searching, inserting into or deleting from it takes O(n) because you must walk from the start.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Each node holds a value and a pointer to the next node; nodes are allocated only as needed.',
          segs: [3, 4],
        },
        {
          id: 'kp2',
          text: 'Growing never copies existing elements: nodes stay put and only pointers are updated.',
          segs: [4],
        },
        {
          id: 'kp3',
          text: 'Search, insert and delete in a sorted linked list are O(n): you start at the beginning and follow pointers.',
          segs: [0, 4],
        },
        {
          id: 'kp4',
          text: 'Even a sorted linked list cannot use binary search efficiently: just finding the middle takes O(n).',
          segs: [5, 6],
        },
      ],
      segs: [0, 3, 4, 5, 6],
      salience: 0.7,
    },
    {
      key: 'binary_search_trees',
      name: 'Binary search trees',
      summary:
        'A binary search tree keeps every node greater than its left subtree and less than its right subtree, so a balanced tree supports O(log n) search and insertion, but inserting in sorted order without rebalancing degrades it into an O(n) linked list.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Each node holds a value and two pointers, to its left and right child.',
          segs: [10],
        },
        {
          id: 'kp2',
          text: 'Every node is greater than its left child and less than its right child, recursively for every subtree.',
          segs: [12],
        },
        {
          id: 'kp3',
          text: 'Search compares at each node and discards a whole subtree; a balanced tree has height about log₂ n, so search is O(log n).',
          segs: [11, 13],
        },
        {
          id: 'kp4',
          text: 'Search is naturally recursive: NULL → false; smaller → left subtree; larger → right subtree; equal → true.',
          segs: [15, 16],
        },
        {
          id: 'kp5',
          text: 'Inserting already-sorted values builds a long, stringy tree that behaves like a linked list: O(n).',
          segs: [17, 18],
        },
      ],
      segs: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      salience: 0.9,
    },
    {
      key: 'hash_functions',
      name: 'Hash functions',
      summary:
        'A hash function maps an unbounded set of inputs to a finite range of bucket indices, such as a name’s first letter to 0–25, so collisions are unavoidable and a better function spreads keys more evenly at the cost of more buckets.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Hashing maps an infinite domain to a finite range, like sorting cards into suit buckets.',
          segs: [20],
        },
        {
          id: 'kp2',
          text: "A hash function returns the bucket for an input, e.g. toupper(name[0]) − 'A' gives 0–25.",
          segs: [21, 22, 23],
        },
        {
          id: 'kp3',
          text: 'Because there are more possible inputs than buckets, collisions are unavoidable.',
          segs: [27],
        },
        {
          id: 'kp4',
          text: 'Hashing on more letters reduces collisions but needs vastly more buckets, many of them unused.',
          segs: [30, 31],
        },
      ],
      segs: [20, 21, 22, 23, 27, 30, 31],
      salience: 0.7,
    },
    {
      key: 'hash_tables',
      name: 'Hash tables',
      summary:
        'A hash table is an array of buckets, each a linked list, indexed by a hash function; it is fast when keys spread evenly over enough buckets, but collisions create chains of about n/k nodes, so lookup is not always O(1): in the worst case it is O(n).',
      keyPoints: [
        {
          id: 'kp1',
          text: 'A hash table associates keys with values, like a dictionary; here it is an array of linked lists.',
          segs: [24, 25],
        },
        {
          id: 'kp2',
          text: 'To insert, hash the key to a bucket and add a node to that bucket’s linked list (chaining).',
          segs: [26, 28],
        },
        {
          id: 'kp3',
          text: 'Collisions are unavoidable, so a lookup may have to walk a chain rather than jump straight to the item.',
          segs: [27, 30],
        },
        {
          id: 'kp4',
          text: 'With k buckets and evenly spread keys chains are about n/k long, but O(n/k) is still O(n): lookup is not always O(1).',
          segs: [29, 32],
        },
        {
          id: 'kp5',
          text: 'A smarter hash function reduces collisions, at the cost of many more buckets and much more memory.',
          segs: [30, 31],
        },
      ],
      segs: [19, 24, 25, 26, 27, 28, 29, 30, 31, 32],
      salience: 0.95,
    },
    {
      key: 'tries',
      name: 'Tries',
      summary:
        'A trie is a tree of arrays with one pointer per letter, so looking up a key follows one pointer per character: time proportional to the key’s length, independent of how many keys are stored, at the cost of a lot of memory.',
      keyPoints: [
        {
          id: 'kp1',
          text: 'Each trie node is an array of 26 pointers (A–Z), plus a flag marking that a word ends there.',
          segs: [34, 35],
        },
        {
          id: 'kp2',
          text: 'Insert and lookup follow one pointer per letter (T → O → A → D) and then check the end-of-word flag.',
          segs: [35, 37],
        },
        {
          id: 'kp3',
          text: 'Words share prefixes: Toad, Toadette and Tom reuse the same nodes.',
          segs: [36],
        },
        {
          id: 'kp4',
          text: 'Lookup takes steps proportional to the key’s length k, O(k), regardless of n; with bounded name lengths that is effectively constant.',
          segs: [38],
        },
        {
          id: 'kp5',
          text: 'The trade-off is memory: every node has 26 pointers, most of them NULL.',
          segs: [39],
        },
      ],
      segs: [33, 34, 35, 36, 37, 38, 39],
      salience: 0.85,
    },
  ],
}
