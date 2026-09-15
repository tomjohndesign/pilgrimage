"use client"

import { Children, Fragment, isValidElement, useState, type ComponentProps, type ReactElement, type ReactNode } from "react"
import { Button as BaseButton } from "@base-ui/react/button"
import { Select as BaseSelect } from "@base-ui/react/select"
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox"
import { Tooltip } from "@base-ui/react/tooltip"
import { Check, ChevronDown } from "lucide-react"

/** Shared Base UI controls for game and workspace chrome.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D4R-0
 */
export function ChromeButton({ title, children, className = "", ref, ...props }: ComponentProps<"button">) {
  const button = <BaseButton {...props} ref={ref} className={`chrome-button ${className}`}>{children}</BaseButton>
  return title ? <Tooltip.Root><Tooltip.Trigger render={button} /><Tooltip.Portal><Tooltip.Positioner sideOffset={8} collisionPadding={12} className="chrome-popup-positioner"><Tooltip.Popup className="chrome-tooltip">{title}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal></Tooltip.Root> : button
}

export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string }
function plainText(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : String(child)).join("")
}
/** Preserve authored option groups while sharing one accessible select implementation. */
export function selectOptions(children: ReactNode, group?: string, disabled = false): SelectOption[] {
  const options: SelectOption[] = []
  Children.forEach(children, child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return
    if (child.type === "option") options.push({ value: String(child.props.value ?? plainText(child.props.children)), label: plainText(child.props.children), disabled: disabled || child.props.disabled, group })
    else if (child.type === "optgroup" || child.type === Fragment) options.push(...selectOptions(child.props.children, child.props.label ?? group, disabled || !!child.props.disabled))
  })
  return options
}
// The change payload is deliberately value-only. Existing editors keep their
// domain conversions; Base UI owns focus, keyboard input, selection and forms.
type ValueChange = { target: { value: string }; currentTarget: { value: string } }
export interface ChromeSelectProps extends Omit<ComponentProps<"select">, "value" | "defaultValue" | "onChange" | "ref" | "multiple" | "size" | "onKeyDown" | "onBlur" | "onFocus"> {
  value?: string | number; defaultValue?: string | number; onChange?: (event: ValueChange) => void;
  options?: SelectOption[];
}
export function ChromeSelect({ children, options: supplied, value, defaultValue, onChange, className = "", disabled, name, required, id, style, title, ...props }: ChromeSelectProps) {
  const options = supplied ?? selectOptions(children)
  const [local, setLocal] = useState(String(defaultValue ?? options[0]?.value ?? ""))
  const selected = value === undefined ? local : String(value)
  return <BaseSelect.Root value={selected} disabled={disabled} name={name} required={required} items={options} onValueChange={next => {
    if (next === null) return
    setLocal(next); onChange?.({ target: { value: next }, currentTarget: { value: next } })
  }}>
    <BaseSelect.Trigger id={id} className={`chrome-select ${className}`} style={style} aria-label={props["aria-label"] ?? title} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]}>
      <BaseSelect.Value /><BaseSelect.Icon><ChevronDown size={12} /></BaseSelect.Icon>
    </BaseSelect.Trigger>
    <BaseSelect.Portal><BaseSelect.Positioner sideOffset={5} alignItemWithTrigger={false} collisionPadding={12} className="chrome-popup-positioner">
      <BaseSelect.Popup className="chrome-select-popup"><BaseSelect.List>
        {options.map((option, index) => <Fragment key={option.value}>{option.group && option.group !== options[index - 1]?.group && <div className="chrome-select-group">{option.group}</div>}
          <BaseSelect.Item value={option.value} disabled={option.disabled} className="chrome-select-item"><BaseSelect.ItemIndicator><Check size={13} /></BaseSelect.ItemIndicator><BaseSelect.ItemText>{option.label}</BaseSelect.ItemText></BaseSelect.Item>
        </Fragment>)}
      </BaseSelect.List></BaseSelect.Popup>
    </BaseSelect.Positioner></BaseSelect.Portal>
  </BaseSelect.Root>
}

type CheckedChange = { target: { checked: boolean }; currentTarget: { checked: boolean } }
export function ChromeCheckbox({ onChange, className = "", type: _type, ...props }: Omit<ComponentProps<"input">, "onChange" | "ref" | "value" | "onClick" | "onKeyDown" | "onFocus" | "onBlur"> & { onChange?: (event: CheckedChange) => void }) {
  return <BaseCheckbox.Root checked={props.checked} defaultChecked={props.defaultChecked} onCheckedChange={checked => onChange?.({ target: { checked }, currentTarget: { checked } })}
    disabled={props.disabled} name={props.name} required={props.required} id={props.id} aria-label={props["aria-label"]} aria-describedby={props["aria-describedby"]} className={`chrome-checkbox ${className}`}>
    <BaseCheckbox.Indicator><Check size={12} strokeWidth={2} /></BaseCheckbox.Indicator>
  </BaseCheckbox.Root>
}
