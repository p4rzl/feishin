import clsx from 'clsx';
import { ComponentPropsWithoutRef, memo, useMemo } from 'react';

import styles from './lyric-line.module.css';

import { Box } from '/@/shared/components/box/box';
import { Stack } from '/@/shared/components/stack/stack';

interface LyricLineProps extends ComponentPropsWithoutRef<'div'> {
    alignment: 'center' | 'left' | 'right';
    fontSize: number;
    text: string;
    wordByWord?: boolean;
}

export const LyricLine = memo(
    ({ alignment, className, fontSize, text, wordByWord, ...props }: LyricLineProps) => {
        const lines = useMemo(() => text.split('_BREAK_'), [text]);

        const style = useMemo(
            () => ({
                fontSize,
                textAlign: alignment,
            }),
            [fontSize, alignment],
        );

        return (
            <Box className={clsx(styles.lyricLine, className)} style={style} {...props}>
                <Stack gap={0}>
                    {lines.map((line, index) =>
                        wordByWord ? (
                            <span key={index}>
                                {line.split(' ').filter((w) => w.length > 0).map((word, wordIdx) => (
                                    <span
                                        className={styles.lyricWord}
                                        key={`${index}-${wordIdx}`}
                                    >
                                        {word}{' '}
                                    </span>
                                ))}
                            </span>
                        ) : (
                            <span key={index}>{line}</span>
                        ),
                    )}
                </Stack>
            </Box>
        );
    },
);

LyricLine.displayName = 'LyricLine';
