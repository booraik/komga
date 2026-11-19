import {
  applyReaderLayoutSetting,
  buildReaderPages,
  findSpreadIndex,
  isSplit2PageAvailable,
  isSplitLandscapeActive,
  isSplittablePage,
  nextReaderLayoutSetting,
  PageHalf,
  pageHalfStyle,
  ReaderPage,
  readerLayoutSetting,
  readerPageKey,
  SPLIT_2PAGE_LAYOUT,
  SplitLandscapeOptions,
} from '@/functions/reader-pages'
import {PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {ReadingDirection} from '@/types/enum-books'
import {PageDtoWithUrl} from '@/types/komga-books'

function page(number: number, width?: number, height?: number): PageDtoWithUrl {
  return {
    number,
    width,
    height,
    fileName: `${number}.jpg`,
    mediaType: 'image/jpeg',
    size: '1 MiB',
    url: `/api/v1/books/book1/pages/${number}`,
  } as PageDtoWithUrl
}

const portrait = (n: number) => page(n, 1000, 1500)
const landscape = (n: number) => page(n, 2000, 1500)

const enabledLtr: SplitLandscapeOptions = {
  splitLandscapePages: true,
  pageLayout: PagedReaderLayout.SINGLE_PAGE,
  readingDirection: ReadingDirection.LEFT_TO_RIGHT,
}
const enabledRtl: SplitLandscapeOptions = {...enabledLtr, readingDirection: ReadingDirection.RIGHT_TO_LEFT}

describe('isSplitLandscapeActive', () => {
  test('given the setting is disabled then it should not be active', () => {
    expect(isSplitLandscapeActive({...enabledLtr, splitLandscapePages: false})).toBe(false)
  })

  test.each([
    ['left to right', ReadingDirection.LEFT_TO_RIGHT],
    ['right to left', ReadingDirection.RIGHT_TO_LEFT],
  ])('given single page layout and %s reading then it should be active', (_, readingDirection) => {
    expect(isSplitLandscapeActive({...enabledLtr, readingDirection})).toBe(true)
  })

  test.each([
    ['double pages', PagedReaderLayout.DOUBLE_PAGES],
    ['double pages no cover', PagedReaderLayout.DOUBLE_NO_COVER],
  ])('given %s layout then it should not be active', (_, pageLayout) => {
    expect(isSplitLandscapeActive({...enabledLtr, pageLayout})).toBe(false)
  })

  test.each([
    ['vertical', ReadingDirection.VERTICAL],
    ['webtoon', ReadingDirection.WEBTOON],
  ])('given %s reading then it should not be active', (_, readingDirection) => {
    expect(isSplitLandscapeActive({...enabledLtr, readingDirection})).toBe(false)
  })
})

describe('isSplittablePage', () => {
  test('given a landscape page with valid dimensions then it should be splittable', () => {
    expect(isSplittablePage(landscape(1))).toBe(true)
  })

  test('given a portrait page then it should not be splittable', () => {
    expect(isSplittablePage(portrait(1))).toBe(false)
  })

  test('given a square page then it should not be splittable', () => {
    expect(isSplittablePage(page(1, 1500, 1500))).toBe(false)
  })

  test.each([
    ['missing width and height', undefined, undefined],
    ['missing height', 2000, undefined],
    ['missing width', undefined, 1500],
    ['zero height', 2000, 0],
    ['negative height', 2000, -1500],
    ['negative width', -2000, -3000],
    ['NaN height', 2000, NaN],
    ['infinite width', Infinity, 1500],
  ])('given %s then it should not be splittable', (_, width, height) => {
    expect(isSplittablePage(page(1, width, height))).toBe(false)
  })
})

describe('buildReaderPages', () => {
  test('given no pages then it should return no reader pages', () => {
    expect(buildReaderPages([], enabledLtr)).toEqual([])
  })

  test('given the setting is disabled then it should keep one reader page per physical page', () => {
    const pages = [portrait(1), landscape(2), portrait(3)]

    const readerPages = buildReaderPages(pages, {...enabledLtr, splitLandscapePages: false})

    expect(readerPages.map(p => p.number)).toEqual([1, 2, 3])
    expect(readerPages.every(p => p.half === undefined)).toBe(true)
  })

  test('given left to right reading then landscape pages should be split into left half then right half', () => {
    const pages = [portrait(1), landscape(2), portrait(3)]

    const readerPages = buildReaderPages(pages, enabledLtr)

    expect(readerPages.map(p => [p.number, p.half])).toEqual([
      [1, undefined],
      [2, PageHalf.LEFT],
      [2, PageHalf.RIGHT],
      [3, undefined],
    ])
  })

  test('given right to left reading then landscape pages should be split into right half then left half', () => {
    const pages = [portrait(1), landscape(2), portrait(3)]

    const readerPages = buildReaderPages(pages, enabledRtl)

    expect(readerPages.map(p => [p.number, p.half])).toEqual([
      [1, undefined],
      [2, PageHalf.RIGHT],
      [2, PageHalf.LEFT],
      [3, undefined],
    ])
  })

  test('given a split page then both halves should keep the physical page number, image url and dimensions', () => {
    const original = landscape(7)

    const halves = buildReaderPages([original], enabledLtr)

    expect(halves).toHaveLength(2)
    halves.forEach(half => {
      expect(half.number).toEqual(7)
      expect(half.url).toEqual(original.url)
      expect(half.fileName).toEqual(original.fileName)
      expect(half.mediaType).toEqual(original.mediaType)
      expect(half.width).toEqual(original.width)
      expect(half.height).toEqual(original.height)
    })
  })

  test('given a split page then it should not mutate the physical pages', () => {
    const pages = [landscape(1)]

    buildReaderPages(pages, enabledLtr)

    expect(pages).toEqual([landscape(1)])
    expect('half' in pages[0]).toBe(false)
  })

  test('given landscape pages with invalid dimensions then they should not be split', () => {
    const pages = [page(1, 2000, undefined), page(2, 2000, 0), page(3, Infinity, 1500), page(4)]

    const readerPages = buildReaderPages(pages, enabledLtr)

    expect(readerPages.map(p => [p.number, p.half])).toEqual([
      [1, undefined],
      [2, undefined],
      [3, undefined],
      [4, undefined],
    ])
  })

  test.each([
    ['double pages', PagedReaderLayout.DOUBLE_PAGES],
    ['double pages no cover', PagedReaderLayout.DOUBLE_NO_COVER],
  ])('given %s layout then landscape pages should not be split', (_, pageLayout) => {
    const readerPages = buildReaderPages([portrait(1), landscape(2)], {...enabledLtr, pageLayout})

    expect(readerPages.map(p => [p.number, p.half])).toEqual([[1, undefined], [2, undefined]])
  })

  test.each([
    ['vertical', ReadingDirection.VERTICAL],
    ['webtoon', ReadingDirection.WEBTOON],
  ])('given %s reading then landscape pages should not be split', (_, readingDirection) => {
    const readerPages = buildReaderPages([portrait(1), landscape(2)], {...enabledLtr, readingDirection})

    expect(readerPages.map(p => [p.number, p.half])).toEqual([[1, undefined], [2, undefined]])
  })
})

describe('readerPageKey', () => {
  test('given split and unsplit pages then every reader page should have a unique key', () => {
    const pages = [portrait(1), landscape(2), landscape(3), portrait(4)]

    for (const options of [enabledLtr, enabledRtl]) {
      const keys = buildReaderPages(pages, options).map(readerPageKey)

      expect(keys).toHaveLength(6)
      expect(new Set(keys).size).toEqual(keys.length)
    }
  })

  test('given the same physical page then full page and half keys should differ', () => {
    const full = buildReaderPages([landscape(2)], {...enabledLtr, splitLandscapePages: false})
    const halves = buildReaderPages([landscape(2)], enabledLtr)

    const keys = [...full, ...halves].map(readerPageKey)

    expect(new Set(keys).size).toEqual(3)
  })
})

describe('pageHalfStyle', () => {
  const [left, right] = buildReaderPages([landscape(2)], enabledLtr)

  test('given a full page then it should not need a clipping style', () => {
    expect(pageHalfStyle(portrait(1), ScaleType.SCREEN)).toBeUndefined()
    expect(pageHalfStyle(landscape(2), ScaleType.SCREEN)).toBeUndefined()
  })

  test('given a left half then it should clip the image to its left half', () => {
    expect(pageHalfStyle(left, ScaleType.SCREEN)).toMatchObject({objectFit: 'cover', objectPosition: 'left center'})
  })

  test('given a right half then it should clip the image to its right half', () => {
    expect(pageHalfStyle(right, ScaleType.SCREEN)).toMatchObject({objectFit: 'cover', objectPosition: 'right center'})
  })

  test.each([
    ['screen', ScaleType.SCREEN, 'min(100vw, 100vh * 1000 / 1500)', 'min(100vh, 100vw * 1500 / 1000)'],
    ['fit width', ScaleType.WIDTH, '100vw', 'calc(100vw * 1500 / 1000)'],
    ['fit width shrink only', ScaleType.WIDTH_SHRINK_ONLY, 'min(100vw, 1000px)', 'min(100vw * 1500 / 1000, 1500px)'],
    ['fit height', ScaleType.HEIGHT, 'calc(100vh * 1000 / 1500)', '100vh'],
    ['original', ScaleType.ORIGINAL, '1000px', '1500px'],
  ])('given %s scale then the half should be sized to the aspect ratio of half the page', (_, scale, width, height) => {
    expect(pageHalfStyle(left, scale)).toEqual({width, height, objectFit: 'cover', objectPosition: 'left center'})
  })

  test('given an odd page width then each half should be exactly half of the page width', () => {
    const [oddLeft] = buildReaderPages([page(3, 2001, 1500)], enabledLtr)

    expect(pageHalfStyle(oddLeft, ScaleType.ORIGINAL)).toMatchObject({width: '1000.5px', height: '1500px'})
  })
})

describe('findSpreadIndex', () => {
  const single = (n: number, half?: PageHalf) => [{number: n, half} as ReaderPage]
  const singleSpreads = [single(1), single(2), single(3)]
  const splitSpreads = [single(1), single(2, PageHalf.LEFT), single(2, PageHalf.RIGHT), single(3)]
  const doubleSpreads = [
    [{number: 0}, {number: 1}],
    [{number: 2}, {number: 3}],
    [{number: 4}, {number: 0}],
  ] as PageDtoWithUrl[][]

  test('given single page spreads then it should return the spread of the page', () => {
    expect(findSpreadIndex(singleSpreads, 1)).toEqual(0)
    expect(findSpreadIndex(singleSpreads, 3)).toEqual(2)
  })

  test('given double page spreads then it should return the spread containing the page', () => {
    expect(findSpreadIndex(doubleSpreads, 1)).toEqual(0)
    expect(findSpreadIndex(doubleSpreads, 3)).toEqual(1)
    expect(findSpreadIndex(doubleSpreads, 4)).toEqual(2)
  })

  test('given a split page then it should return the first half of the page', () => {
    expect(findSpreadIndex(splitSpreads, 2)).toEqual(1)
    expect(findSpreadIndex(splitSpreads, 3)).toEqual(3)
  })

  test('given the current spread already shows the page then it should stay on the current spread', () => {
    expect(findSpreadIndex(splitSpreads, 2, 2)).toEqual(2)
    expect(findSpreadIndex(splitSpreads, 2, 1)).toEqual(1)
  })

  test('given the current spread shows another page then it should return the first spread of the page', () => {
    expect(findSpreadIndex(splitSpreads, 2, 3)).toEqual(1)
    expect(findSpreadIndex(splitSpreads, 2, 0)).toEqual(1)
  })

  test('given the page is not found then it should fall back to the page index', () => {
    expect(findSpreadIndex([], 5)).toEqual(4)
    expect(findSpreadIndex(singleSpreads, 5)).toEqual(4)
  })
})

describe('reader layout setting', () => {
  test.each([
    ReadingDirection.LEFT_TO_RIGHT,
    ReadingDirection.RIGHT_TO_LEFT,
  ])('shows split 2 pages as the selected layout when split pages are enabled and reading %s', (direction) => {
    expect(readerLayoutSetting(PagedReaderLayout.SINGLE_PAGE, true, direction)).toBe(SPLIT_2PAGE_LAYOUT)
  })

  test('shows the single page layout when reading vertically, as pages are not split', () => {
    expect(readerLayoutSetting(PagedReaderLayout.SINGLE_PAGE, true, ReadingDirection.VERTICAL))
      .toBe(PagedReaderLayout.SINGLE_PAGE)
  })

  test('shows the double pages layout even if split pages are enabled', () => {
    expect(readerLayoutSetting(PagedReaderLayout.DOUBLE_PAGES, true, ReadingDirection.LEFT_TO_RIGHT))
      .toBe(PagedReaderLayout.DOUBLE_PAGES)
  })

  test('split 2 pages is only available when reading left to right or right to left', () => {
    expect(isSplit2PageAvailable(ReadingDirection.LEFT_TO_RIGHT)).toBe(true)
    expect(isSplit2PageAvailable(ReadingDirection.RIGHT_TO_LEFT)).toBe(true)
    expect(isSplit2PageAvailable(ReadingDirection.VERTICAL)).toBe(false)
    expect(isSplit2PageAvailable(ReadingDirection.WEBTOON)).toBe(false)
  })

  test('cycling goes through every layout, including split 2 pages and back to single page', () => {
    const direction = ReadingDirection.LEFT_TO_RIGHT

    expect(nextReaderLayoutSetting(PagedReaderLayout.SINGLE_PAGE, direction)).toBe(PagedReaderLayout.DOUBLE_PAGES)
    expect(nextReaderLayoutSetting(PagedReaderLayout.DOUBLE_PAGES, direction)).toBe(PagedReaderLayout.DOUBLE_NO_COVER)
    expect(nextReaderLayoutSetting(PagedReaderLayout.DOUBLE_NO_COVER, direction)).toBe(SPLIT_2PAGE_LAYOUT)
    expect(nextReaderLayoutSetting(SPLIT_2PAGE_LAYOUT, direction)).toBe(PagedReaderLayout.SINGLE_PAGE)
  })

  test('cycling skips split 2 pages when reading vertically', () => {
    expect(nextReaderLayoutSetting(PagedReaderLayout.DOUBLE_NO_COVER, ReadingDirection.VERTICAL))
      .toBe(PagedReaderLayout.SINGLE_PAGE)
  })

  test('selecting split 2 pages uses single-page layout and enables splitting', () => {
    expect(applyReaderLayoutSetting(SPLIT_2PAGE_LAYOUT)).toEqual({
      pageLayout: PagedReaderLayout.SINGLE_PAGE,
      splitLandscapePages: true,
    })
  })

  test('selecting a regular layout disables split 2 pages', () => {
    expect(applyReaderLayoutSetting(PagedReaderLayout.DOUBLE_PAGES)).toEqual({
      pageLayout: PagedReaderLayout.DOUBLE_PAGES,
      splitLandscapePages: false,
    })
  })
})
