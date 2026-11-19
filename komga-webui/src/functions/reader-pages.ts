import {PageDto, PageDtoWithUrl} from '@/types/komga-books'
import {PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {ReadingDirection} from '@/types/enum-books'

export enum PageHalf {
  LEFT = 'left',
  RIGHT = 'right',
}

/**
 * A page as displayed by the paged reader.
 * When a landscape page is split, each half is a separate ReaderPage that keeps the physical page number and image url,
 * so that navigation and read progress still refer to physical pages.
 */
export interface ReaderPage extends PageDtoWithUrl {
  half?: PageHalf,
}

export interface SplitLandscapeOptions {
  splitLandscapePages: boolean,
  pageLayout: PagedReaderLayout,
  readingDirection: ReadingDirection,
}

export const SPLIT_2PAGE_LAYOUT = 'split-2page' as const

export type ReaderLayoutSetting = PagedReaderLayout | typeof SPLIT_2PAGE_LAYOUT

export function isSplitLandscapeActive(options: SplitLandscapeOptions): boolean {
  return options.splitLandscapePages
    && options.pageLayout === PagedReaderLayout.SINGLE_PAGE
    && (options.readingDirection === ReadingDirection.LEFT_TO_RIGHT || options.readingDirection === ReadingDirection.RIGHT_TO_LEFT)
}

export function isSplit2PageAvailable(readingDirection: ReadingDirection): boolean {
  return isSplitLandscapeActive({
    splitLandscapePages: true,
    pageLayout: PagedReaderLayout.SINGLE_PAGE,
    readingDirection,
  })
}

export function readerLayoutSetting(
  pageLayout: PagedReaderLayout,
  splitLandscapePages: boolean,
  readingDirection: ReadingDirection,
): ReaderLayoutSetting {
  return isSplitLandscapeActive({splitLandscapePages, pageLayout, readingDirection})
    ? SPLIT_2PAGE_LAYOUT
    : pageLayout
}

export function nextReaderLayoutSetting(
  current: ReaderLayoutSetting,
  readingDirection: ReadingDirection,
): ReaderLayoutSetting {
  const settings: ReaderLayoutSetting[] = [
    ...Object.values(PagedReaderLayout),
    ...(isSplit2PageAvailable(readingDirection) ? [SPLIT_2PAGE_LAYOUT] : []),
  ]
  return settings[(settings.indexOf(current) + 1) % settings.length]
}

export function applyReaderLayoutSetting(setting: ReaderLayoutSetting): {
  pageLayout: PagedReaderLayout
  splitLandscapePages: boolean
} {
  if (setting === SPLIT_2PAGE_LAYOUT) {
    return {
      pageLayout: PagedReaderLayout.SINGLE_PAGE,
      splitLandscapePages: true,
    }
  }

  return {
    pageLayout: setting,
    splitLandscapePages: false,
  }
}

function isValidDimension(value?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function isSplittablePage<T extends PageDto>(page: T): page is T & { width: number, height: number } {
  const {width, height} = page
  return isValidDimension(width) && isValidDimension(height) && width > height
}

export function buildReaderPages(pages: PageDtoWithUrl[], options: SplitLandscapeOptions): ReaderPage[] {
  if (!isSplitLandscapeActive(options)) return pages
  const halves = options.readingDirection === ReadingDirection.RIGHT_TO_LEFT
    ? [PageHalf.RIGHT, PageHalf.LEFT]
    : [PageHalf.LEFT, PageHalf.RIGHT]
  return pages.flatMap(page => isSplittablePage(page) ? halves.map(half => ({...page, half})) : [page])
}

export function readerPageKey(page: ReaderPage): string {
  return page.half ? `${page.number}-${page.half}` : `${page.number}`
}

/**
 * Index of the spread to display for a physical page number.
 * If the spread at currentIndex already shows the page it is kept, so that moving between the halves of a split page
 * does not jump back to its first half.
 */
export function findSpreadIndex(spreads: PageDtoWithUrl[][], pageNumber: number, currentIndex?: number): number {
  const showsPage = (spread?: PageDtoWithUrl[]) => !!spread?.some(p => p.number === pageNumber)
  if (currentIndex !== undefined && showsPage(spreads[currentIndex])) return currentIndex
  const index = spreads.findIndex(showsPage)
  return index >= 0 ? index : pageNumber - 1
}

/**
 * Inline style displaying only one half of the page image.
 * The image box is sized to the aspect ratio of half the page, and `object-fit: cover` scales the full image
 * to the box height, so that `object-position` shows exactly the requested half of the same image url.
 */
export function pageHalfStyle(page: ReaderPage, scale: ScaleType): Record<string, string> | undefined {
  if (!page.half || !isSplittablePage(page)) return undefined
  return {
    ...halfSize(page.width / 2, page.height, scale),
    objectFit: 'cover',
    objectPosition: page.half === PageHalf.LEFT ? 'left center' : 'right center',
  }
}

function halfSize(halfWidth: number, height: number, scale: ScaleType): { width: string, height: string } {
  switch (scale) {
    case ScaleType.SCREEN:
      return {
        width: `min(100vw, 100vh * ${halfWidth} / ${height})`,
        height: `min(100vh, 100vw * ${height} / ${halfWidth})`,
      }
    case ScaleType.WIDTH:
      return {width: '100vw', height: `calc(100vw * ${height} / ${halfWidth})`}
    case ScaleType.WIDTH_SHRINK_ONLY:
      return {
        width: `min(100vw, ${halfWidth}px)`,
        height: `min(100vw * ${height} / ${halfWidth}, ${height}px)`,
      }
    case ScaleType.HEIGHT:
      return {width: `calc(100vh * ${halfWidth} / ${height})`, height: '100vh'}
    default:
      return {width: `${halfWidth}px`, height: `${height}px`}
  }
}
