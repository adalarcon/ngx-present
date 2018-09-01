import {Component, Injectable, OnDestroy} from '@angular/core';
import {Mutator, ObservableSelection, Store} from '@w11k/tydux';
import {toAngularComponent} from '@w11k/tydux/dist/angular-integration';
import {untilComponentDestroyed} from 'ng2-rx-componentdestroyed';
import {ActivatedSlide, Coordinates} from '@w11k/ngx-present';
import {map, shareReplay, switchMap, take} from 'rxjs/operators';
import {Observable} from 'rxjs';

export class HelpState {
  [key: string]: {
    open: boolean
  }
}

export class HelpMutator extends Mutator<HelpState> {
  setOpen(id: string, open: boolean) {
    this.state = {
      ...this.state,
      [id]: {
        ...this.state[id],
        open: open
      }
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class HelpService extends Store<HelpMutator, HelpState> {

  private registry = new Map<string, number>();

  constructor() {
    super('MoreDetails', new HelpMutator(), new HelpState());
  }

  register(slideCoordinates: Coordinates): Coordinates {
    const oldCounter = this.registry.get(slideCoordinates.join('/'));

    let newCounter = 0;
    if (oldCounter !== undefined) {
      newCounter = oldCounter + 1;
    }

    this.registry.set(slideCoordinates.join('/'), newCounter);

    return [...slideCoordinates, newCounter];
  }

  deregister(detailsCoordinates: Coordinates) {
    const slideCoordinates = detailsCoordinates.slice(0, -1);

    this.registry.delete(slideCoordinates.join('/'));
  }

  open(slideCoordinates: Coordinates) {
    this.mutate.setOpen(slideCoordinates.join('/'), true);
  }

  close(slideCoordinates: Coordinates) {
    this.mutate.setOpen(slideCoordinates.join('/'), false);
  }

  isOpen(detailsCoordinates: Coordinates): ObservableSelection<boolean> {
    return super
      .select(state => state[detailsCoordinates.join('/')])
      .pipe(map(subState => {
        if (subState !== undefined) {
          return subState.open;
        } else {
          return false;
        }
      }));
  }
}

@Component({
  selector: 'tcc-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss']
})
export class TccHelpComponent implements OnDestroy {

  open$: Observable<boolean>;
  private id$: Observable<Coordinates>;

  constructor(private readonly service: HelpService,
              private readonly activatedSlide: ActivatedSlide) {
    this.id$ = this.activatedSlide.slide
      .pipe(
        map(x => this.service.register(x.coordinates)),
        take(1),
        untilComponentDestroyed(this),
        shareReplay(1)
      );

    this.open$ = this.id$
      .pipe(
        switchMap(id => this.service.isOpen(id).bounded(toAngularComponent(this))),
        untilComponentDestroyed(this),
      );

  }

  open() {
    this.id$
      .pipe(take(1))
      .subscribe(id => this.service.open(id));
  }

  close() {
    this.id$
      .pipe(take(1))
      .subscribe(id => this.service.close(id));
  }

  ngOnDestroy(): void {
    this.id$
      .pipe(take(1))
      .subscribe(id => this.service.deregister(id));
  }
}