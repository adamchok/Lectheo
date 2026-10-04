import type { ItemFx } from './types'

/** Hand-verified practice bank for Lecture 5. Segment idxs refer to lecture5 segments. */
export const lecture5Items: ItemFx[] = [
  // ---------- arrays ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'arrays',
    variant: 1,
    segs: [2, 3],
    stem: 'An int array holding 3 million values is full, and you need room for one more. Using malloc or realloc, what does growing it typically cost?',
    options: {
      a: 'O(n): a bigger block is allocated and all 3 million existing values are copied into it',
      b: 'O(1): the array simply extends into the next bytes of memory',
      c: 'O(log n), like binary search',
      d: 'Nothing is possible: C arrays can never change size',
    },
    correct: 'a',
    explanation:
      'An array must be contiguous, and the memory right after it may already be in use. So growing generally means a new, larger block plus copying every existing element (realloc does this copy for you when it must move the block).',
    distractors: {
      b: [
        'The memory after an array is always free',
        'Other data may live right after the array, so it usually has to move, which means copying.',
      ],
      c: [
        'Resizing is a divide-and-conquer operation',
        'Copying touches every element once, which is linear, not logarithmic.',
      ],
      d: [
        'Arrays are permanently fixed',
        'A fixed-size block cannot grow in place, but you can allocate a bigger one and copy; it just costs O(n).',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'arrays',
    variant: 2,
    segs: [1, 2, 5, 6],
    stem: 'Why can binary search jump straight to the middle of a sorted array, but not to the middle of a sorted linked list?',
    options: {
      a: 'Array elements are contiguous, so the middle’s address is computed with arithmetic; a linked list must be walked node by node',
      b: 'Arrays are always smaller than linked lists',
      c: 'Linked lists cannot be kept in sorted order',
      d: 'Binary search only works on data stored on the stack',
    },
    correct: 'a',
    explanation:
      'With contiguous elements, the address of element i is start + i × element size, computed in one step. Linked-list nodes can be anywhere, so reaching the middle means following about n/2 pointers.',
    distractors: {
      b: [
        'Size decides whether binary search applies',
        'Size is irrelevant; what matters is constant-time access to any index.',
      ],
      c: [
        'Linked lists cannot be sorted',
        'The lecture’s list was sorted; the problem is reaching its middle, not ordering it.',
      ],
      d: [
        'Binary search needs stack memory',
        'Where the memory lives does not matter; contiguity does.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'arrays',
    variant: 1,
    segs: [1, 2, 3],
    sentences: [
      'An array stores its elements back to back in memory.',
      'So the address of element i can be computed directly from the start of the array.',
      'That is why a sorted array supports binary search in O(log n).',
      'When a full array needs one more slot, C simply extends it in place in O(1), since the next bytes are always free.',
    ],
    flaw: {
      idx: 3,
      summary:
        'Growing an array generally means allocating a bigger block and copying everything: O(n).',
      correction:
        'The memory after the array may be in use, so you generally allocate a new, larger block and copy all n elements into it, which is O(n).',
    },
    explanation:
      'Arrays are fast to index because they are contiguous, and that same contiguity makes growing expensive: nothing guarantees the neighboring memory is free.',
    rubric: [
      'Resizing cost',
      'States that growing an array generally requires allocating a new block and copying all elements, O(n).',
    ],
    hints: [
      'Think about what else might be stored right after the array in memory.',
      'In lecture, what had to happen to 3 million values when the array was too small?',
    ],
    leak: ['copy', 'O(n)', 'realloc', 'new block'],
  },
  {
    kind: 'spot_flaw',
    concept: 'arrays',
    variant: 2,
    segs: [1, 2, 3],
    sentences: [
      'A program stores 1,000 exam scores, sorted, in an array of exactly 1,000 ints.',
      'Finding a score with binary search takes at most about 10 comparisons.',
      'Adding a 1,001st score requires allocating a bigger block and copying the existing 1,000 scores into it.',
      'Allocating spare room up front avoids frequent copying, at the cost of memory that might go unused.',
    ],
    flaw: null,
    explanation:
      'All correct: log₂ 1000 ≈ 10 so binary search needs at most 10 comparisons, a full fixed-size array must be reallocated and copied to grow, and over-allocating trades memory for fewer copies.',
    rubric: [
      'Justifies the verdict',
      'Confirms the ~10-comparison bound, the copy on growth, and the memory-for-time trade-off.',
    ],
    hints: [
      'Check the arithmetic of the binary search claim.',
      'Is there any claim about resizing that would hold for a linked list but not an array?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },

  // ---------- linked_lists ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'linked_lists',
    variant: 1,
    segs: [5, 6],
    stem: 'You keep 1 million numbers in a sorted, singly linked list. A friend proposes binary search to find a number in O(log n). What is the problem?',
    options: {
      a: 'There is no arithmetic to jump to the middle node; reaching it alone means walking about n/2 nodes, so the search is O(n) anyway',
      b: 'Nothing: the list is sorted, so binary search runs in O(log n)',
      c: 'It would work, but needs O(n²) extra memory',
      d: 'A linked list cannot hold sorted data because its nodes are scattered in memory',
    },
    correct: 'a',
    explanation:
      'Binary search’s speed comes from constant-time access to the middle. In a linked list the only way to the middle is to follow pointers from the start, so each halving step already costs O(n).',
    distractors: {
      b: [
        'Sorted order alone makes binary search fast',
        'It also needs random access to the middle element, which a linked list lacks.',
      ],
      c: [
        'The problem is memory, not time',
        'No extra memory is needed; the cost is the O(n) walk to each middle.',
      ],
      d: [
        'Scattered nodes cannot be in order',
        'Order comes from the next pointers, not from where nodes sit in memory.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'linked_lists',
    variant: 2,
    segs: [3, 4],
    stem: 'Compared with an array, what do you gain and what do you give up by storing values in a linked list?',
    options: {
      a: 'Gain: growing one node at a time without copying. Give up: extra memory for pointers and O(n) access instead of jumping to an index',
      b: 'Gain: O(1) search. Give up: nothing',
      c: 'Gain: less memory per value. Give up: nodes can never be freed',
      d: 'Gain: binary search. Give up: you must declare the size in advance',
    },
    correct: 'a',
    explanation:
      'Each node is malloc’d when needed and linked in, so the list never has to be copied to grow. The costs are a pointer per node and losing index arithmetic: reaching an element means walking from the start.',
    distractors: {
      b: [
        'Linked lists search in constant time',
        'Searching means following pointers one node at a time: O(n).',
      ],
      c: [
        'Linked lists save memory',
        'Each node also stores a pointer, so they use more memory per value; and nodes can be freed.',
      ],
      d: [
        'Linked lists enable binary search',
        'That describes arrays: they allow binary search but need their size up front.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'linked_lists',
    variant: 1,
    segs: [0, 3, 4],
    sentences: [
      'Each node in a linked list stores a number and a pointer to the next node.',
      'To add a number, the program mallocs one new node and updates a pointer or two, without copying existing nodes.',
      'Searching the list still means starting at the first node and following pointers, which is O(n).',
      'A doubly linked list adds a pointer to the previous node, which simplifies some code but does not change that O(n) search.',
    ],
    flaw: null,
    explanation:
      'All correct. Linked lists grow without copying, search requires a walk from the start, and doubly linked lists make some insertions and deletions easier to code without changing the asymptotic search cost.',
    rubric: [
      'Justifies the verdict',
      'Explains why growth needs no copying and why search stays O(n), even when doubly linked.',
    ],
    hints: [
      'Check each claim about cost against how you move through a linked list.',
      'Does an extra pointer per node let you skip ahead to the middle?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },
  {
    kind: 'spot_flaw',
    concept: 'linked_lists',
    variant: 2,
    segs: [3, 4, 5, 6],
    sentences: [
      'A sorted linked list of n numbers starts with a pointer to its first node.',
      'Unlike an array, its nodes can be scattered anywhere in memory.',
      'Because the list is sorted, the program can compute the middle node’s address and run binary search in O(log n).',
      'Inserting a new number in order means walking to the right spot and updating pointers.',
      'Growing the list never requires copying all the existing numbers.',
    ],
    flaw: {
      idx: 2,
      summary: 'Scattered nodes have no computable middle; reaching it takes an O(n) walk.',
      correction:
        'Nodes are not contiguous, so the middle can only be reached by walking from the head (O(n)); search in a linked list stays O(n).',
    },
    explanation:
      'Sentence 2 already gives it away: if nodes can be anywhere, no arithmetic yields the middle’s address. Being sorted is necessary for binary search, but not sufficient.',
    rubric: [
      'No random access',
      'States that the middle node cannot be computed and must be reached by walking, so search remains O(n).',
    ],
    hints: [
      'Compare the third sentence with the second one.',
      'What does binary search need besides sorted data?',
    ],
    leak: ['walk', 'no arithmetic', 'not contiguous', 'O(n)'],
  },

  // ---------- binary_search_trees ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'binary_search_trees',
    variant: 1,
    segs: [17, 18],
    stem: 'You insert 1, 2, 3, 4, 5, 6, 7, in that order, into an empty binary search tree with no rebalancing. How many nodes does a search for 7 visit?',
    options: {
      a: '7: every node hangs to the right of the previous one, so the tree is effectively a linked list and search is O(n)',
      b: '3, because a binary search tree always has height about log₂ n',
      c: '1, because the largest value is stored at the root',
      d: 'It may not find 7, because the result is no longer a valid binary search tree',
    },
    correct: 'a',
    explanation:
      'Each new value is larger than everything before it, so it goes right of the previous node. The tree is valid but has height n, so searching for 7 visits all 7 nodes: O(n).',
    distractors: {
      b: [
        'Every BST is balanced',
        'Height depends on insertion order; only balanced (or self-rebalancing) trees guarantee about log₂ n.',
      ],
      c: [
        'The largest value sits at the root',
        'The first value inserted, 1, is the root; 7 ends up at the bottom.',
      ],
      d: [
        'A stringy tree breaks the BST property',
        'Every node is still less than its right child, so the tree is valid and search is correct, just slow.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'binary_search_trees',
    variant: 2,
    segs: [11, 12],
    stem: 'Searching a binary search tree for 5, you reach a node containing 4. Why can the search ignore that node’s entire left subtree?',
    options: {
      a: 'Every value in a node’s left subtree is less than the node, so 5 cannot be there',
      b: 'Because left subtrees are always smaller in size than right subtrees',
      c: 'Because search always tries the right side first and only goes left if that fails',
      d: 'Because left subtrees only ever contain leaves',
    },
    correct: 'a',
    explanation:
      'The BST property holds recursively: everything left of 4 is less than 4, so less than 5. Discarding a whole subtree at each step is what gives O(log n) search in a balanced tree.',
    distractors: {
      b: [
        'Subtree sizes decide where to search',
        'The decision comes from comparing values; subtree sizes can be anything.',
      ],
      c: [
        'Search explores right then backtracks left',
        'BST search never backtracks: one comparison decides the only possible side.',
      ],
      d: [
        'Left subtrees contain only leaves',
        'Left subtrees can be arbitrarily deep; what matters is that their values are smaller.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'binary_search_trees',
    variant: 1,
    segs: [10, 12, 13, 17, 18],
    sentences: [
      'In a binary search tree, each node stores a number and pointers to a left and a right child.',
      'Every node is greater than everything in its left subtree and less than everything in its right subtree.',
      'To search, compare with the root and continue into only one subtree, ignoring the other.',
      'Because of this property, every binary search tree has height about log₂ n, no matter the order in which values were inserted.',
      'A balanced tree with 7 nodes therefore needs at most 3 comparisons to find a value.',
    ],
    flaw: {
      idx: 3,
      summary:
        'Height depends on insertion order; sorted insertions produce a stringy tree of height n.',
      correction:
        'Height depends on insertion order: inserting sorted values gives a stringy tree of height n (O(n) search); only a balanced or rebalanced tree has height about log₂ n.',
    },
    explanation:
      'The ordering property says nothing about shape. Inserting 1, 2, 3, … builds a linked list; trees that rebalance themselves on insertion are what guarantee logarithmic height. A balanced 7-node tree has 3 levels, so sentence 5 is right.',
    rubric: [
      'Height depends on order',
      'States that a BST’s height depends on insertion order and can degrade to n without rebalancing.',
    ],
    hints: [
      'Try inserting 1, 2, 3, 4 into an empty tree and draw the result.',
      'Does the ordering property constrain the tree’s shape?',
    ],
    leak: ['insertion order', 'stringy', 'linked list', 'balanced', 'height n'],
  },
  {
    kind: 'spot_flaw',
    concept: 'binary_search_trees',
    variant: 2,
    segs: [15, 16],
    sentences: [
      'A recursive search(tree, number) first returns false if tree is NULL.',
      'If number is less than tree->number, it searches tree->left.',
      'If number is greater than tree->number, it also searches tree->left, since that subtree is checked faster.',
      'Otherwise number equals tree->number, so it returns true.',
    ],
    flaw: {
      idx: 2,
      summary: 'Larger values are in the right subtree.',
      correction:
        'If number is greater than tree->number, search tree->right, because every larger value is in the right subtree.',
    },
    explanation:
      'Each comparison must follow the BST property: smaller goes left, larger goes right. Searching left for a larger value always ends at NULL and wrongly returns false.',
    rubric: ['Right subtree', 'States that a larger number must be searched for in tree->right.'],
    hints: [
      'Recall where a BST stores values larger than a node.',
      'Which branch can never contain a number larger than the current node?',
    ],
    leak: ['tree->right', 'right subtree', 'right child'],
  },

  // ---------- hash_functions ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'hash_functions',
    variant: 1,
    segs: [22, 23],
    stem: 'hash(name) returns toupper(name[0]) - \'A\'. What do hash("luigi") and hash("Link") return?',
    options: {
      a: '11 and 11: the same bucket, a collision',
      b: '11 and 12, because lowercase and uppercase letters hash differently',
      c: '12 and 12, because L is the 12th letter of the alphabet',
      d: 'Two different values, because a hash function gives every distinct name its own bucket',
    },
    correct: 'a',
    explanation:
      "toupper makes 'l' and 'L' both 'L', and 'L' − 'A' = 11 (buckets count from 0). Any two names with the same first letter collide.",
    distractors: {
      b: [
        'Case changes the bucket',
        'toupper normalizes the first letter, so case does not matter here.',
      ],
      c: [
        'Buckets are numbered from 1',
        "Subtracting 'A' maps A to 0, so L, the 12th letter, maps to 11.",
      ],
      d: [
        'Hash functions never map different inputs to the same bucket',
        'With 26 buckets and unlimited names, many names must share a bucket.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'hash_functions',
    variant: 2,
    segs: [20, 27],
    stem: 'Why can no hash function that maps names into 26 buckets avoid collisions, however clever it is?',
    options: {
      a: 'There are far more possible names than buckets, so some names must share a bucket',
      b: 'It can avoid them by hashing on the last letter instead of the first',
      c: 'Collisions happen only because of bugs in the hash function',
      d: 'It can avoid them by returning a random bucket each time it is called',
    },
    correct: 'a',
    explanation:
      'Hashing maps an infinite domain onto a finite range; by the pigeonhole principle, once there are more keys than buckets, at least two share one. A good hash function spreads keys evenly; it cannot eliminate collisions.',
    distractors: {
      b: [
        'Some letter position is collision-free',
        'Any single letter still gives only 26 possible buckets for unlimited names.',
      ],
      c: [
        'Collisions are a bug',
        'They are a mathematical consequence of mapping many inputs to few outputs.',
      ],
      d: [
        'Randomness avoids collisions',
        'A hash must be deterministic: the same key must hash to the same bucket every time or lookups fail.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'hash_functions',
    variant: 1,
    segs: [21, 22, 23, 27],
    sentences: [
      'A hash function takes an input, such as a name, and returns a bucket index.',
      "One simple choice uses the name's first letter: toupper(name[0]) - 'A'.",
      'That maps every name that starts with an English letter to a number from 0 to 25.',
      'Because each name gets a different number, two names never land in the same bucket.',
    ],
    flaw: {
      idx: 3,
      summary: 'Names with the same first letter share a bucket; collisions are guaranteed.',
      correction:
        'Many names share a first letter (Luigi and Link both hash to 11), so collisions are unavoidable with 26 buckets.',
    },
    explanation:
      'Sentence 3 is the giveaway: only 26 possible outputs for unlimited names means collisions must happen.',
    rubric: [
      'Collisions exist',
      'States that names with the same first letter collide, so 26 buckets cannot give every name its own bucket.',
    ],
    hints: [
      'Think of two names that start with the same letter.',
      'How many different outputs can this function produce, and how many names exist?',
    ],
    leak: ['collision', 'same first letter', 'same bucket', 'pigeonhole'],
  },
  {
    kind: 'spot_flaw',
    concept: 'hash_functions',
    variant: 2,
    segs: [20, 30, 31],
    sentences: [
      'Hashing maps a huge or infinite set of inputs onto a small, fixed set of outputs.',
      'Sorting playing cards into four piles by suit is a kind of hashing.',
      'Hashing names on their first three letters usually gives fewer collisions than hashing on the first letter alone.',
      'But it needs 26 × 26 × 26 = 17,576 buckets, many of which would stay empty.',
    ],
    flaw: null,
    explanation:
      'All correct: hashing maps an infinite domain to a finite range, suits are buckets, more letters means fewer names per bucket, and 26³ = 17,576 buckets is the memory cost the lecture warned about.',
    rubric: [
      'Justifies the verdict',
      'Confirms the collision trade-off and the 26³ = 17,576 bucket count.',
    ],
    hints: [
      'Check the arithmetic in the last sentence.',
      'What does adding letters to the hash do to collisions, and to memory?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },

  // ---------- hash_tables ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'hash_tables',
    variant: 1,
    segs: [27, 29, 30, 32],
    stem: 'A contacts app uses a hash table with 26 buckets (by first letter) and chaining, and stores 100,000 contacts. What does looking someone up cost?',
    options: {
      a: 'O(1) always: the hash jumps straight to the right bucket, so it is a single step',
      b: 'Jumping to the bucket is O(1), but then you walk its chain; with about 100,000 / 26 ≈ 3,800 names per chain it is O(n/k), still O(n)',
      c: 'O(log n), because the buckets are in alphabetical order',
      d: 'O(26), a constant, because there are only 26 buckets to check',
    },
    correct: 'b',
    explanation:
      'Hashing finds the bucket in constant time, but every name sharing that letter is in the same linked list. With a fixed 26 buckets the chains grow with n; big O drops the constant 1/26, so lookups are O(n). Hash tables approach constant time only when buckets keep pace with n and keys spread evenly; if keys pile into one bucket, the worst case is O(n).',
    distractors: {
      a: [
        'Hash table lookup is always O(1)',
        'Finding the bucket is O(1), but walking its chain is not; collisions make chains grow with n.',
      ],
      c: [
        'Buckets in alphabetical order enable binary search',
        'Within a bucket the chain is a linked list, which can only be walked from the start.',
      ],
      d: [
        'Lookup cost depends on the number of buckets, not on chain length',
        'You check one bucket, but its chain holds about n/26 names, which grows with n.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'hash_tables',
    variant: 2,
    segs: [25, 28, 29],
    stem: 'In a chained hash table, every one of 1,000 keys happens to hash to the same bucket. What does a lookup become?',
    options: {
      a: 'O(n): the table has degenerated into one linked list of 1,000 nodes',
      b: 'O(1), because computing the hash still takes constant time',
      c: 'O(log n), because each chain is kept sorted',
      d: 'Lookups fail, because a bucket can hold only one key',
    },
    correct: 'a',
    explanation:
      'This is the worst case: all keys collide, so after the O(1) hash you walk a single chain of n nodes. A hash function that spreads keys evenly is what keeps chains short.',
    distractors: {
      b: [
        'Only the hash computation counts',
        'After hashing you still search the chain, which here holds every key.',
      ],
      c: [
        'Chains support binary search',
        'A chain is a linked list; even sorted, it must be walked from the start.',
      ],
      d: [
        'Buckets hold only one key',
        'With chaining, colliding keys are linked into the same bucket’s list.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'hash_tables',
    variant: 1,
    segs: [25, 26, 27, 28, 29, 32],
    sentences: [
      'A contacts app stores names in a hash table: an array of 26 buckets, each pointing to a linked list.',
      'To insert Mario, it hashes "M" to bucket 12 and adds a node to that bucket’s list.',
      'When Mabel arrives she collides with Mario, so she is chained into the same list.',
      'Because the hash function jumps straight to the right bucket, looking up any name always takes O(1) time, no matter how many contacts there are.',
      'A smarter hash function could reduce collisions, at the cost of more buckets and memory.',
    ],
    flaw: {
      idx: 3,
      summary: 'Lookup must walk the bucket’s chain, which grows with n; it is not always O(1).',
      correction:
        'After jumping to the bucket you must walk its chain; with 26 buckets chains average about n/26 names, so lookup is O(n/k) = O(n), and O(n) in the worst case when keys collide.',
    },
    explanation:
      'This is the classic misconception: hashing to the bucket is O(1), but sentence 3 itself shows names piling into one list. Lookups approach constant time only when the number of buckets grows with n and the hash spreads keys evenly.',
    rubric: [
      'Chain cost',
      'States that lookup must walk the bucket’s chain, so its cost grows with n (O(n/k), worst case O(n)) rather than always being O(1).',
    ],
    hints: [
      'Follow what happens after the hash function picks a bucket.',
      'What happens to the length of bucket 12’s list as more M names arrive?',
    ],
    leak: ['always O(1)', 'chain', 'n/k', 'O(n)', 'walk the list'],
  },
  {
    kind: 'spot_flaw',
    concept: 'hash_tables',
    variant: 2,
    segs: [27, 28, 29, 30, 31],
    sentences: [
      'A hash table uses a hash function to choose a bucket for each key.',
      'Each bucket holds a pointer to a linked list, so colliding keys can share a bucket.',
      'If all n keys happen to hash to the same bucket, lookup degrades to walking one list of n nodes.',
      'To avoid collisions entirely, it is enough to use a hash function that is fast to compute.',
      'Using more buckets with a hash function that spreads keys evenly keeps the chains short.',
    ],
    flaw: {
      idx: 3,
      summary:
        'Speed of the hash does not prevent collisions; more keys than buckets guarantees some.',
      correction:
        'How fast the hash runs does not affect collisions; what helps is spreading keys evenly over enough buckets, and with more keys than buckets some collisions are unavoidable.',
    },
    explanation:
      'Collisions come from mapping many keys onto fewer buckets. A good hash function distributes keys uniformly; computation speed is a separate concern.',
    rubric: [
      'Collisions unavoidable',
      'States that collisions depend on distribution and bucket count, not hash speed, and cannot be eliminated when keys outnumber buckets.',
    ],
    hints: [
      'Separate how fast a hash function is from where it sends keys.',
      'Can any function map more keys than buckets without two keys sharing one?',
    ],
    leak: ['unavoidable', 'pigeonhole', 'spread evenly', 'distribution'],
  },

  // ---------- tries ----------
  {
    kind: 'diagnostic_mcq',
    concept: 'tries',
    variant: 1,
    segs: [37, 38],
    stem: 'A trie stores 3 million names. Compared with a trie storing just 3 names, how many steps does checking whether "Toad" is present take?',
    options: {
      a: 'The same, about 4: one step per letter, because lookup depends on the name’s length, not on how many names are stored',
      b: 'About log₂(3 million) ≈ 22 steps versus about 2, like a balanced tree',
      c: 'About 3 million steps, because every name must be checked',
      d: 'Fewer steps in the bigger trie, because more names create more shortcuts',
    },
    correct: 'a',
    explanation:
      'Lookup follows the T, O, A and D pointers and checks the end-of-name flag. That is O(k) in the key length k, independent of n; with bounded name lengths the lecture calls it effectively constant time.',
    distractors: {
      b: [
        'A trie behaves like a balanced binary search tree',
        'A trie does not compare whole keys at each level; it indexes by the next letter, so depth equals key length.',
      ],
      c: [
        'Every stored name must be examined',
        'Each letter selects one child pointer directly, so other names are never examined.',
      ],
      d: [
        'More names make lookups faster',
        'The path for "Toad" has the same four nodes no matter what else is stored.',
      ],
    },
  },
  {
    kind: 'diagnostic_mcq',
    concept: 'tries',
    variant: 2,
    segs: [39],
    stem: 'Tries give lookups whose cost does not grow with the number of stored words. Why might you still pick a hash table instead?',
    options: {
      a: 'Tries use a huge amount of memory: every node has 26 pointers, and most of them are NULL',
      b: 'Tries cannot store words that are prefixes of other words',
      c: 'Trie lookups get slower as more words are added',
      d: 'Tries require the words to be sorted before they are inserted',
    },
    correct: 'a',
    explanation:
      'Speed costs space: each node reserves a pointer for every letter even though most are unused. A well-sized hash table is far more compact while still fast on average.',
    distractors: {
      b: [
        'Prefixes cannot be stored',
        'Toad and Toadette coexist: each has its own end-of-word flag along a shared path.',
      ],
      c: [
        'Lookups slow down as the trie grows',
        'Lookup depends on the key’s length, not on how many keys are stored.',
      ],
      d: [
        'Tries need sorted input',
        'Words can be inserted in any order; each insertion just follows or creates its letters’ nodes.',
      ],
    },
  },
  {
    kind: 'spot_flaw',
    concept: 'tries',
    variant: 1,
    segs: [34, 35, 36, 38],
    sentences: [
      'Each node in a trie is an array of 26 pointers, one for each letter from A to Z.',
      'To insert Toad, you follow or create the T pointer, then O, then A, then D.',
      'At the final node you set a flag that marks the end of a name.',
      'Toadette cannot be added afterward, because Toad already occupies the T-O-A-D path.',
      'Looking up a name takes a number of steps equal to its length, regardless of how many names are stored.',
    ],
    flaw: {
      idx: 3,
      summary: 'Names that are prefixes of each other share nodes; each just has its own end flag.',
      correction:
        'Toadette continues past D through E, T, T, E and gets its own end flag; the flag on D still marks Toad, so both are stored.',
    },
    explanation:
      'Sharing prefixes is a feature of tries, not a conflict. The end-of-name flag is exactly what distinguishes Toad from the longer Toadette on the same path.',
    rubric: [
      'Prefix sharing',
      'States that Toadette extends the shared T-O-A-D path with its own nodes and end flag.',
    ],
    hints: [
      'Think about what the end-of-name flag is for.',
      'Can a path continue past a node that is marked as the end of a name?',
    ],
    leak: ['shared prefix', 'continues past', 'end flag', 'Toadette'],
  },
  {
    kind: 'spot_flaw',
    concept: 'tries',
    variant: 2,
    segs: [34, 36, 38, 39],
    sentences: [
      'A trie stores names implicitly: no node holds the string "Tom"; the path T-O-M plus an end flag represents it.',
      'Tom and Toad share the nodes for T and O.',
      'Checking whether Tom is stored takes 3 steps whether the trie holds 3 names or 3 million.',
      'Most of the 26 pointers in a typical node are NULL, which is why tries use so much memory.',
    ],
    flaw: null,
    explanation:
      'All correct: names are encoded by paths and end flags, shared prefixes share nodes, lookup cost depends on key length only, and sparse 26-pointer nodes waste memory.',
    rubric: [
      'Justifies the verdict',
      'Explains implicit storage, prefix sharing, length-based lookup cost and the memory trade-off.',
    ],
    hints: [
      'Check each claim against how insert and lookup walk a trie.',
      'Does anything in a trie lookup depend on how many names are stored?',
    ],
    leak: ['no flaw', 'fully correct', 'all correct'],
  },
]
