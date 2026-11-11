import { Icon } from '../ui';
import { optionLabel, optionShop, type PickerOption } from '../products/picker-options';

export function ProductChoiceGrid({ options, selected, disabled, toggle }: {
  options: PickerOption[]; selected: PickerOption[]; disabled: boolean; toggle: (option: PickerOption) => void;
}) {
  return <div className="product-set-choice-grid">{options.map(option => {
    const order = selected.findIndex(item => item.key === option.key);
    return <button key={option.key} className={`product-set-choice${order >= 0 ? ' selected' : ''}`}
      title={`${optionLabel(option)} · ${optionShop(option)} · ${option.imageKeys.length} 张${option.disabledReason ? ` · ${option.disabledReason}` : ''}`}
      disabled={disabled || Boolean(option.disabledReason)} aria-label={`选择款号：${optionLabel(option)}`} aria-pressed={order >= 0} onClick={() => toggle(option)}>
      <span className="product-set-photo">{option.coverUrl ? <img src={option.coverUrl} alt="" loading="lazy"/> : <Icon name="image"/>}</span>
      {order >= 0 ? <span className="product-set-order" aria-label={`已选第 ${order + 1} 组`}>{order + 1}<Icon name="check"/></span> : null}
      <strong>{option.styleNumber}</strong>
      <small className="product-set-shop" title={optionShop(option)}>{optionShop(option)}</small>
      {option.disabledReason ? <small className="product-set-unavailable">{option.disabledReason}</small> : null}
    </button>;
  })}</div>;
}

