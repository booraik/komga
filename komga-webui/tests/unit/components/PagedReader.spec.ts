import 'jest-canvas-mock'
import {createLocalVue, mount, Wrapper} from '@vue/test-utils'
import {CreateElement} from 'vue'
import _ from 'lodash'
import PagedReader from '@/components/readers/PagedReader.vue'
import {PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {ReadingDirection} from '@/types/enum-books'
import {PageDtoWithUrl} from '@/types/komga-books'

const localVue = createLocalVue()
localVue.directive('touch', {})

const renderSlot = (cls: string) => ({
  render(this: any, h: CreateElement) {
    return h('div', {class: cls}, this.$slots.default)
  },
})

function page(number: number, width: number, height: number): PageDtoWithUrl {
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

function mountReader(props: Record<string, unknown> = {}): Wrapper<any> {
  return mount(PagedReader, {
    localVue,
    stubs: {
      'v-carousel': renderSlot('carousel'),
      'v-carousel-item': renderSlot('carousel-item'),
    },
    mocks: {
      $debug: () => undefined,
      $_: _,
    },
    propsData: {
      pages: [portrait(1), landscape(2), portrait(3)],
      page: 1,
      pageLayout: PagedReaderLayout.SINGLE_PAGE,
      animations: false,
      swipe: false,
      readingDirection: ReadingDirection.LEFT_TO_RIGHT,
      scale: ScaleType.SCREEN,
      splitLandscapePages: true,
      ...props,
    },
  })
}

const slides = (wrapper: Wrapper<any>) => wrapper.findAll('.carousel-item').wrappers
const images = (wrapper: Wrapper<any>) => wrapper.findAll('img').wrappers
const style = (image: Wrapper<any>) => (image.element as HTMLImageElement).style

describe('PagedReader split landscape pages rendering', () => {
  let wrapper: Wrapper<any>

  afterEach(() => {
    wrapper?.destroy()
    jest.restoreAllMocks()
  })

  test('given split enabled then a landscape page should render as two slides of the same image', () => {
    wrapper = mountReader()

    expect(slides(wrapper)).toHaveLength(4)
    expect(slides(wrapper).map(s => s.findAll('img').length)).toEqual([1, 1, 1, 1])
    expect(images(wrapper).map(i => i.attributes('src'))).toEqual([
      '/api/v1/books/book1/pages/1',
      '/api/v1/books/book1/pages/2',
      '/api/v1/books/book1/pages/2',
      '/api/v1/books/book1/pages/3',
    ])
    expect(images(wrapper).map(i => i.attributes('alt'))).toEqual(['Page 1', 'Page 2', 'Page 2', 'Page 3'])
  })

  test('given a split page then its image container should fill the viewport and center the page vertically', () => {
    wrapper = mountReader()

    const splitContainer = slides(wrapper)[1].find('.split-page-container')
    expect(splitContainer.exists()).toBe(true)
    expect((splitContainer.element as HTMLElement).style.minHeight).toBe('100vh')
    expect((splitContainer.element as HTMLElement).style.alignItems).toBe('center')
    expect(slides(wrapper)[0].find('.split-page-container').exists()).toBe(false)
  })

  test('given left to right reading then the left half should be rendered before the right half', () => {
    wrapper = mountReader()

    const [, first, second] = images(wrapper)
    expect(style(first).objectFit).toEqual('cover')
    expect(style(first).objectPosition).toEqual('left center')
    expect(style(second).objectFit).toEqual('cover')
    expect(style(second).objectPosition).toEqual('right center')
  })

  test('given right to left reading then the right half should be rendered before the left half', () => {
    wrapper = mountReader({readingDirection: ReadingDirection.RIGHT_TO_LEFT})

    const [, first, second] = images(wrapper)
    expect(style(first).objectPosition).toEqual('right center')
    expect(style(second).objectPosition).toEqual('left center')
  })

  test('given split enabled then full pages should keep the scale class and no clipping style', () => {
    wrapper = mountReader()

    const [full, half] = images(wrapper)
    expect(full.classes()).toContain('img-fit-screen')
    expect(full.attributes('style')).toBeUndefined()
    expect(half.classes()).not.toContain('img-fit-screen')
  })

  test('given split enabled then rendering should not produce duplicate keys', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    wrapper = mountReader({pages: [landscape(1), landscape(2), portrait(3), landscape(4)]})

    expect(slides(wrapper)).toHaveLength(7)
    expect(errors).not.toHaveBeenCalled()
  })

  test('given the split setting is not provided then landscape pages should not be split', () => {
    wrapper = mountReader({splitLandscapePages: undefined})

    expect(slides(wrapper)).toHaveLength(3)
    expect(images(wrapper).every(i => i.attributes('style') === undefined)).toBe(true)
  })

  test.each([
    ['double pages', PagedReaderLayout.DOUBLE_PAGES],
    ['double pages no cover', PagedReaderLayout.DOUBLE_NO_COVER],
  ])('given %s layout then landscape pages should not be split', (_, pageLayout) => {
    wrapper = mountReader({pageLayout})

    const sources = images(wrapper).map(i => i.attributes('src'))
    expect(sources.filter(src => src === '/api/v1/books/book1/pages/2')).toHaveLength(1)
    expect(images(wrapper).every(i => i.attributes('style') === undefined)).toBe(true)
  })

  test('given vertical reading then landscape pages should not be split', () => {
    wrapper = mountReader({readingDirection: ReadingDirection.VERTICAL})

    expect(slides(wrapper)).toHaveLength(3)
  })

  test('given landscape pages without valid dimensions then they should not be split', () => {
    wrapper = mountReader({pages: [portrait(1), page(2, 2000, 0), portrait(3)]})

    expect(slides(wrapper)).toHaveLength(3)
  })

  test('given split is toggled then the slides should be rebuilt', async () => {
    wrapper = mountReader({splitLandscapePages: false})
    expect(slides(wrapper)).toHaveLength(3)

    await wrapper.setProps({splitLandscapePages: true})
    expect(slides(wrapper)).toHaveLength(4)

    await wrapper.setProps({splitLandscapePages: false})
    expect(slides(wrapper)).toHaveLength(3)
  })
})

/**
 * Mounts the reader with its page synced like DivinaReader does with `:page.sync`.
 * `progress` records the physical pages the parent would send as read progress (it only reacts to page changes).
 */
function mountSyncedReader(props: Record<string, unknown> = {}) {
  const wrapper = mountReader(props)
  const progress: number[] = []
  const sync = async () => {
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('update:page') || []
    const last = emitted.length > 0 ? emitted[emitted.length - 1][0] : undefined
    if (last !== undefined && last !== wrapper.props('page')) {
      progress.push(last)
      await wrapper.setProps({page: last})
    }
  }
  return {wrapper, progress, sync}
}

/** What the current slide shows, for example `2 left` for the left half of page 2, or `3` for a full page. */
function displayed(wrapper: Wrapper<any>): string {
  return slides(wrapper)[wrapper.vm.carouselPage].findAll('img').wrappers
    .map(img => {
      const number = (img.attributes('alt') || '').replace('Page ', '')
      const position = style(img).objectPosition
      return position ? `${number} ${position.split(' ')[0]}` : number
    })
    .join(' | ')
}

const emittedPages = (wrapper: Wrapper<any>) => (wrapper.emitted('update:page') || []).map(e => e[0])

const pressKey = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', {key}))

describe('PagedReader split landscape pages navigation and progress', () => {
  let wrapper: Wrapper<any>

  beforeEach(() => {
    jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    wrapper?.destroy()
    jest.restoreAllMocks()
  })

  test('given left to right reading when moving forward then it should show the left half then the right half', async () => {
    const reader = mountSyncedReader()
    wrapper = reader.wrapper

    const seen = [displayed(wrapper)]
    for (let i = 0; i < 3; i++) {
      wrapper.vm.next()
      await reader.sync()
      seen.push(displayed(wrapper))
    }

    expect(seen).toEqual(['1', '2 left', '2 right', '3'])
  })

  test('given left to right reading when moving backward from the next page then it should land on the right half', async () => {
    const reader = mountSyncedReader({page: 3})
    wrapper = reader.wrapper
    await reader.sync()

    const seen = [displayed(wrapper)]
    for (let i = 0; i < 3; i++) {
      wrapper.vm.prev()
      await reader.sync()
      seen.push(displayed(wrapper))
    }

    expect(seen).toEqual(['3', '2 right', '2 left', '1'])
    expect(wrapper.props('page')).toEqual(1)
  })

  test('given left to right reading then the arrow keys should move between halves', async () => {
    const reader = mountSyncedReader()
    wrapper = reader.wrapper

    pressKey('ArrowRight')
    await reader.sync()
    pressKey('ArrowRight')
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 right')

    pressKey('ArrowLeft')
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 left')
  })

  test('given right to left reading then the arrow keys should show the right half then the left half', async () => {
    const reader = mountSyncedReader({readingDirection: ReadingDirection.RIGHT_TO_LEFT})
    wrapper = reader.wrapper

    const seen = [displayed(wrapper)]
    for (let i = 0; i < 3; i++) {
      pressKey('ArrowLeft')
      await reader.sync()
      seen.push(displayed(wrapper))
    }
    pressKey('ArrowRight')
    await reader.sync()
    seen.push(displayed(wrapper))

    expect(seen).toEqual(['1', '2 right', '2 left', '3', '2 left'])
  })

  test('given right to left reading when moving backward from the next page then it should land on the left half', async () => {
    const reader = mountSyncedReader({page: 3, readingDirection: ReadingDirection.RIGHT_TO_LEFT})
    wrapper = reader.wrapper
    await reader.sync()

    wrapper.vm.prev()
    await reader.sync()

    expect(displayed(wrapper)).toEqual('2 left')
    expect(wrapper.props('page')).toEqual(2)
  })

  test.each([
    ['left to right', ReadingDirection.LEFT_TO_RIGHT, '2 left'],
    ['right to left', ReadingDirection.RIGHT_TO_LEFT, '2 right'],
  ])('given %s reading when going to a split page then it should show its first half', async (_, readingDirection, expected) => {
    const reader = mountSyncedReader({readingDirection})
    wrapper = reader.wrapper

    await wrapper.setProps({page: 2})

    expect(displayed(wrapper)).toEqual(expected)
  })

  test('given split pages then both halves should report the physical page number', async () => {
    const reader = mountSyncedReader({pages: [landscape(1), landscape(2)]})
    wrapper = reader.wrapper

    for (let i = 0; i < 3; i++) {
      wrapper.vm.next()
      await reader.sync()
    }

    expect(displayed(wrapper)).toEqual('2 right')
    expect(emittedPages(wrapper)).toEqual([1, 2, 2])
  })

  test('given split pages then read progress should only change when the physical page changes', async () => {
    const reader = mountSyncedReader({pages: [landscape(1), portrait(2), landscape(3)]})
    wrapper = reader.wrapper

    for (let i = 0; i < 4; i++) {
      wrapper.vm.next()
      await reader.sync()
    }
    for (let i = 0; i < 4; i++) {
      wrapper.vm.prev()
      await reader.sync()
    }

    expect(reader.progress).toEqual([2, 3, 2, 1])
    expect(emittedPages(wrapper).every(p => [1, 2, 3].includes(p))).toBe(true)
  })

  test('given the last physical page is split then moving past its second half should ask for the next book', async () => {
    const reader = mountSyncedReader({pages: [portrait(1), landscape(2)], page: 2})
    wrapper = reader.wrapper
    await reader.sync()

    wrapper.vm.next()
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 right')
    expect(wrapper.emitted('jump-next')).toBeUndefined()

    wrapper.vm.next()
    await reader.sync()
    expect(wrapper.emitted('jump-next')).toHaveLength(1)
  })

  test('given the first physical page is split then moving before its first half should ask for the previous book', async () => {
    const reader = mountSyncedReader({pages: [landscape(1), portrait(2)]})
    wrapper = reader.wrapper

    wrapper.vm.prev()
    await reader.sync()

    expect(displayed(wrapper)).toEqual('1 left')
    expect(wrapper.emitted('jump-previous')).toHaveLength(1)
  })

  test('given the setting is toggled then the current physical page should be kept', async () => {
    const reader = mountSyncedReader({splitLandscapePages: false, page: 3})
    wrapper = reader.wrapper
    await reader.sync()
    expect(displayed(wrapper)).toEqual('3')

    await wrapper.setProps({splitLandscapePages: true})
    await reader.sync()
    expect(displayed(wrapper)).toEqual('3')

    wrapper.vm.prev()
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 right')

    await wrapper.setProps({splitLandscapePages: false})
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2')
    expect(reader.progress).toEqual([2])
  })

  test('given the reading direction changes on a split page then the physical page should be kept', async () => {
    const reader = mountSyncedReader({page: 2})
    wrapper = reader.wrapper
    await reader.sync()
    wrapper.vm.next()
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 right')

    await wrapper.setProps({readingDirection: ReadingDirection.RIGHT_TO_LEFT})
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 right')
    wrapper.vm.next()
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 left')

    await wrapper.setProps({readingDirection: ReadingDirection.VERTICAL})
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2')
    expect(reader.progress).toEqual([])
  })

  test('given the pages change while on the same page number then the slide should show that physical page', async () => {
    const reader = mountSyncedReader({pages: [portrait(1), portrait(2), portrait(3)], page: 3})
    wrapper = reader.wrapper
    await reader.sync()
    expect(displayed(wrapper)).toEqual('3')

    // another book is opened at the same page number, and its split pages shift the slides
    await wrapper.setProps({pages: [landscape(1), portrait(2), portrait(3)]})
    await reader.sync()

    expect(displayed(wrapper)).toEqual('3')
    expect(wrapper.props('page')).toEqual(3)
  })

  test('given the layout changes to double pages on a split page then the physical page should be kept', async () => {
    const reader = mountSyncedReader({page: 2})
    wrapper = reader.wrapper
    await reader.sync()
    wrapper.vm.next()
    await reader.sync()
    expect(displayed(wrapper)).toEqual('2 right')

    await wrapper.setProps({pageLayout: PagedReaderLayout.DOUBLE_PAGES})
    await reader.sync()

    expect(displayed(wrapper)).toEqual('2')
    expect(reader.progress).toEqual([])
  })
})
