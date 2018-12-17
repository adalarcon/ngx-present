import { Coordinates, Slide, Slides } from '../core/presentation.types';
import { Mutator, ObservableSelection, Store } from '@w11k/tydux';
import { filter, map, take, withLatestFrom } from 'rxjs/operators';
import {
  calculateCoordinates, compareCoordinates,
  coordinateToSlideMap,
  equalCoordinates,
  isValidCoordinate,
  routeParamsToCoordinate
} from './slide-by-slide.functions';
import { combineLatest, Observable } from 'rxjs';
import { Injectable, Injector, OnDestroy } from '@angular/core';
import { isNotEditable, KeyboardEventProcessor, nonNavigationEvent } from '../core/event.service';
import { PresentationService } from '../core/presentation.service';
import { flattenDeep, maxDepth } from '../core/utils';
import { toAngularComponent } from '@w11k/tydux/dist/angular-integration';
import { skipPropertyNil } from '../core/rx-utils';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { tableOfContentEntries, tableOfContentSlides } from '../theming/table-of-content';

export type Mode = 'slide' | 'presenter';

export class SlideBySlideState {
  public coordinatesMaxDepth = 0;
  public slides: Slide[] = [];
  public slideMap: { [key: string]: Slide } = {};
  public currentSlide: Slide | undefined;
  public currentMode: Mode | undefined;

  constructor() {}
}

export class SlideBySlideMutator extends Mutator<SlideBySlideState> {

  constructor() {
    super();
  }

  setCurrentSlide(slide: Slide) {
    this.state.currentSlide = slide;
  }

  setCurrentMode(mode: Mode) {
    this.state.currentMode = mode;
  }

  setSlides(slides: Slides) {
    this.state.coordinatesMaxDepth = maxDepth(slides);
    this.state.slides = flattenDeep(slides);
    this.state.slideMap = coordinateToSlideMap(this.state.slides);
  }

}

@Injectable({
  providedIn: 'root'
})
export class SlideBySlideService extends Store<SlideBySlideMutator, SlideBySlideState> implements OnDestroy {

  constructor(injector: Injector,
              private readonly presentation: PresentationService,
              private readonly router: Router) {
    super('SlideBySlide', new SlideBySlideMutator(), new SlideBySlideState());

    this.presentation.select(state => state.slides)
      .bounded(toAngularComponent(this))
      .subscribe(slides => this.mutate.setSlides(slides));
  }

  navigateToNext(coordinatesToKeep: number | undefined, mode?: string) {
    this.nextSlide(coordinatesToKeep)
      .pipe(take(1))
      .subscribe(slide => this.navigateAbsolute(slide, mode));
  }

  navigateToPrevious(coordinatesToKeep: number | undefined, mode?: string) {
    this.previousSlide(coordinatesToKeep)
      .pipe(take(1))
      .subscribe(slide => this.navigateAbsolute(slide, mode));
  }

  previousSlide(coordinatesToKeep: number | undefined, prefix?: string): Observable<Slide | undefined> {
    return this.navigateRelative(-1, coordinatesToKeep);
  }

  nextSlide(coordinatesToKeep: number | undefined): Observable<Slide | undefined> {
    return this.navigateRelative(1, coordinatesToKeep);
  }

  navigateToNextToc(mode?: string) {
    this.nextToc('forward')
      .pipe(take(1))
      .subscribe(slide => this.navigateAbsolute(slide, mode));
  }

  navigateToPreviousToc(mode?: string) {
    this.nextToc('backward')
      .pipe(take(1))
      .subscribe(slide => this.navigateAbsolute(slide, mode));
  }

  nextToc(direction: 'forward' | 'backward'): Observable<Slide | undefined> {
    const currentSlide$ = this
      .selectNonNil(state => state.currentSlide)
      .unbounded();

    const tocSlides$ = this
      .selectNonNil(state => state.slides)
      .pipe(
        filter(x => x.length !== 0),
        map(tableOfContentSlides),
      )
      .unbounded();

    return combineLatest(currentSlide$, tocSlides$)
      .pipe(
        map(([currentSlide, tocSlides]) => {
          if (direction === 'forward') {
            return tocSlides.find(tocSlide => {
              return compareCoordinates(tocSlide.coordinates, currentSlide.coordinates) === 1;
            });
          } else {
            return tocSlides.slice().reverse().find(tocSlide => {
              return compareCoordinates(tocSlide.coordinates, currentSlide.coordinates) === -1;
            });
          }
        }),
      );
  }

  navigateRelative(move: number, coordinatesToKeep: number | undefined): Observable<Slide | undefined> {
    const currentSlide$ = this
      .selectNonNil(state => state.currentSlide)
      .unbounded();

    const slides$ = this
      .selectNonNil(state => state.slides)
      .pipe(
        filter(x => x.length !== 0),
      )
      .unbounded();

    const depth$ = this
      .selectNonNil(state => state.coordinatesMaxDepth)
      .unbounded();


    return combineLatest(slides$, currentSlide$, depth$)
      .pipe(
        map(([slides, current, depth]) => calculateCoordinates(slides, current, move, coordinatesToKeep, depth)),
      );
  }

  navigateAbsolute(target: Coordinates | Slide | undefined, mode?: string) {
    let slide: Slide | undefined;

    if (target instanceof Slide) {
      slide = target;
    } else {
      slide = this.state.slides.find(x => equalCoordinates(target, x.coordinates));
    }

    if (slide === undefined) {
      return;
    }

    let modeWithFallback: string | undefined;

    if (mode !== undefined) {
      modeWithFallback = mode;
    } else if (this.state.currentMode !== undefined) {
      modeWithFallback = this.state.currentMode;
    } else {
      modeWithFallback = 'slide';
    }

    const link = [ `/${modeWithFallback}`, ...slide.coordinates ];

    return this.router.navigate(link, { queryParamsHandling: 'merge' });
  }

  navigateToFirst(prefix?: string) {
    this.firstSlide()
      .unbounded()
      .pipe(take(1))
      .subscribe(slide => this.navigateAbsolute(slide, prefix));
  }

  firstSlide(): ObservableSelection<Slide> {
    return this.selectNonNil(state => state.slides)
      .pipe(
        filter(slides => slides.length > 0),
        map(slides => slides[0])
      );
  }

  isValidCoordinate(coordinates: Coordinates): ObservableSelection<boolean> {
    return this.presentation.selectNonNil(state => state.slides)
      .pipe(
        filter(slides => slides.length > 0),
        map(slides => isValidCoordinate(slides, coordinates))
      );
  }

  private coordinatesToSlide(coordinates: Coordinates): Slide {
    return this.state.slideMap[coordinates.join('.')];
  }

  setCurrentModeAndSlide(route: ActivatedRouteSnapshot) {
    const coordinates = routeParamsToCoordinate(route.params);
    const mode: Mode = route.url[0].path as Mode;
    const slide = this.coordinatesToSlide(coordinates);

    this.mutate.setCurrentSlide(slide);
    this.mutate.setCurrentMode(mode);
  }

  ngOnDestroy(): void {}
}

@Injectable()
export class NavigateSectionForward implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService) {}

  init(events$: Observable<KeyboardEvent>) {
    events$
      .pipe(
        filter(isNotEditable),
        // arrow down + alt || arrow right + alt
        filter(event => {
          if (event.keyCode === 40 && event.altKey) {
            return true;
          } else if (event.keyCode === 39 && event.altKey) {
            return true;
          }

          return false;
        }),
      )
      .subscribe(() => {
        this.service.navigateToNextToc();
      });
  }
}

@Injectable()
export class NavigateSlideForward implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService) {}

  init(events$: Observable<KeyboardEvent>) {
    events$
      .pipe(
        filter(nonNavigationEvent),
        // arrow down, arrow right, or page down
        filter(event => event.keyCode === 40 || event.keyCode === 39 || event.keyCode === 34)
      )
      .subscribe(() => {
        this.service.navigateToNext(-1);
      });
  }
}

@Injectable()
export class NavigateSectionBackward implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService) {}

  init(events$: Observable<KeyboardEvent>) {
    events$
      .pipe(
        filter(isNotEditable),
        // arrow up + alt || arrow left + alt
        filter(event => {
          if (event.keyCode === 38 && event.altKey) {
            return true;
          } else if (event.keyCode === 37 && event.altKey) {
            return true;
          }

          return false;
        }),
      )
      .subscribe(() => {
        this.service.navigateToPreviousToc();
      });
  }
}

@Injectable()
export class NavigateSlideBackward implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService) {}

  init(events$: Observable<KeyboardEvent>) {
    events$
      .pipe(
        filter(nonNavigationEvent),
        // arrow up, arrow left or page up
        filter(event => event.keyCode === 38 || event.keyCode === 37 || event.keyCode === 33)
      )
      .subscribe(() => {
        this.service.navigateToPrevious(-1);
      });
  }
}

@Injectable()
export class NavigateToFirstSlide implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService) {}

  init(events$: Observable<KeyboardEvent>) {
    events$
      .pipe(
        filter(nonNavigationEvent),
        // pos 1
        filter(event => event.keyCode === 36)
      )
      .subscribe(() => {
        this.service.navigateToFirst();
      });
  }
}

@Injectable()
export class NavigateToOverview implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService,
              private readonly presentation: PresentationService) {}

  init(events$: Observable<KeyboardEvent>) {

    const config$ = this.presentation
      .select(state => state.config.navigation.overview)
      .unbounded()
      .pipe(
        skipPropertyNil('component')
      );

    const slide$ = this.service
      .select()
      .unbounded()
      .pipe(
        withLatestFrom(config$),
        map(([state, config]) => state.slides.find(slide => slide.component === config.component))
      );

    events$
      .pipe(
        filter(nonNavigationEvent),
        // pos 1
        filter(event => {
          // o
          return event.keyCode === 79;
        }),
        withLatestFrom(slide$)
      )
      .subscribe(([event, slide]) => {
        this.service.navigateAbsolute(slide);
      });
  }
}

@Injectable()
export class TogglePresenter implements KeyboardEventProcessor {
  constructor(private readonly service: SlideBySlideService,
              private readonly router: Router) {}

  init(events$: Observable<KeyboardEvent>) {

    const slide$ = this.service
      .select()
      .unbounded();

    events$
      .pipe(
        filter(isNotEditable),
        // letter p
        filter(event => event.keyCode === 80 && event.altKey),
        withLatestFrom(slide$)
      )
      .subscribe(([event, state]) => {
        let mode: Mode;

        if (state.currentMode === 'presenter') {
          mode = 'slide';
        } else {
          mode = 'presenter';
        }

        let coordinates: Coordinates = [];

        if (state.currentSlide !== undefined) {
          coordinates = state.currentSlide.coordinates;
        }

        const link = [mode, ...coordinates];
        this.router.navigate(link, { queryParamsHandling: 'merge'});
      });
  }
}
